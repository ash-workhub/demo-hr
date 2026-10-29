// src/app/api/employees/route.js
// GET    /api/employees       — list with search/filter/pagination
// POST   /api/employees       — create (HR/admin only)
import { connectDB, Employee } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { createEmployeeSchema, validate } from '@/lib/zod-schemas.js';

export async function GET(request) {
  let user;
  try {
    user = await requireRole('employee', 'manager', 'hr', 'admin');
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  await connectDB();

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const department = searchParams.get('department') || '';
  const status = searchParams.get('status') || 'active';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));

  const filter = {};
  if (status && status !== 'all') filter.status = status;
  if (department && department !== 'all') filter.department = department;
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { firstName: rx },
      { lastName: rx },
      { email: rx },
      { employeeId: rx },
      { designation: rx },
    ];
  }

  const [items, total] = await Promise.all([
    Employee.find(filter)
      .sort({ firstName: 1, lastName: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({ path: 'managerId', select: 'firstName lastName email employeeId' })
      .lean(),
    Employee.countDocuments(filter),
  ]);

  const safeItems = items.map((e) => ({
    id: e._id.toString(),
    employeeId: e.employeeId,
    firstName: e.firstName,
    lastName: e.lastName,
    fullName: `${e.firstName} ${e.lastName}`,
    email: e.email,
    phone: e.phone,
    department: e.department,
    designation: e.designation,
    role: e.role,
    status: e.status,
    joinDate: e.joinDate,
    avatarColor: e.avatarColor,
    manager: e.managerId
      ? {
          id: e.managerId._id.toString(),
          fullName: `${e.managerId.firstName} ${e.managerId.lastName}`,
          email: e.managerId.email,
          employeeId: e.managerId.employeeId,
        }
      : null,
  }));

  // Also return the list of distinct departments for the filter dropdown.
  const departments = await Employee.distinct('department');

  return Response.json({
    items: safeItems,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
    departments: departments.sort(),
  });
}

export async function POST(request) {
  let user;
  try {
    user = await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return new Response(JSON.stringify({ error: status === 403 ? 'Forbidden' : 'Unauthorized' }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  const { data, error } = validate(createEmployeeSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  await connectDB();

  // Generate a sequential employeeId (FEG-XXX) — not user-supplied.
  const lastEmp = await Employee.findOne().sort({ employeeId: -1 }).lean();
  let nextNum = 11; // start after seed (FEG-010)
  if (lastEmp && /^FEG-(\d+)$/.test(lastEmp.employeeId)) {
    nextNum = Math.max(nextNum, parseInt(lastEmp.employeeId.match(/(\d+)$/)[1], 10) + 1);
  }
  const employeeId = `FEG-${String(nextNum).padStart(3, '0')}`;

  // Validate managerId: must exist AND have role manager/hr/admin (can't set a regular
  // employee as someone's manager).
  if (data.managerId) {
    const mgr = await Employee.findById(data.managerId).lean();
    if (!mgr) return Response.json({ error: { managerId: 'Manager not found' } }, { status: 422 });
    if (!['manager', 'hr', 'admin'].includes(mgr.role)) {
      return Response.json({ error: { managerId: `Selected employee has role '${mgr.role}' — only manager/hr/admin can be managers` } }, { status: 422 });
    }
  }

  try {
    const created = await Employee.create({
      employeeId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone || '',
      department: data.department,
      designation: data.designation,
      managerId: data.managerId || null,
      role: data.role,
      joinDate: new Date(data.joinDate),
      status: data.status,
      avatarColor: data.avatarColor,
    });
    return Response.json({ id: created._id.toString(), employeeId: created.employeeId }, { status: 201 });
  } catch (e) {
    if (e.code === 11000) {
      const field = Object.keys(e.keyPattern || {})[0] || 'field';
      return Response.json({ error: { [field]: `${field} already in use` } }, { status: 409 });
    }
    return Response.json({ error: { _: 'Failed to create employee' } }, { status: 500 });
  }
}
