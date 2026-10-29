// src/app/api/employees/[id]/route.js
// GET    /api/employees/:id   — single employee profile (any signed-in user)
// PATCH  /api/employees/:id   — update (HR/admin only)
// DELETE /api/employees/:id   — soft-delete: set status='inactive' (admin only)
import { connectDB, Employee } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { updateEmployeeSchema, validate } from '@/lib/zod-schemas.js';

function toSafe(e) {
  if (!e) return null;
  return {
    id: e._id.toString(),
    employeeId: e.employeeId,
    firstName: e.firstName,
    lastName: e.lastName,
    fullName: `${e.firstName} ${e.lastName}`,
    email: e.email,
    phone: e.phone,
    department: e.department,
    designation: e.designation,
    // V2 Step 1 — optional reference IDs
    branchId: e.branchId ? e.branchId.toString() : null,
    departmentId: e.departmentId ? e.departmentId.toString() : null,
    designationId: e.designationId ? e.designationId.toString() : null,
    role: e.role,
    status: e.status,
    joinDate: e.joinDate,
    avatarColor: e.avatarColor,
    managerId: e.managerId ? (e.managerId._id ? e.managerId._id.toString() : e.managerId.toString()) : null,
    manager: e.managerId && e.managerId._id ? {
      id: e.managerId._id.toString(),
      fullName: `${e.managerId.firstName} ${e.managerId.lastName}`,
      email: e.managerId.email,
      employeeId: e.managerId.employeeId,
    } : null,
  };
}

export async function GET(request, { params }) {
  try {
    await requireRole('employee', 'manager', 'hr', 'admin');
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  await connectDB();
  const emp = await Employee.findById(id)
    .populate({ path: 'managerId', select: 'firstName lastName email employeeId' })
    .lean();
  if (!emp) return Response.json({ error: 'Not found' }, { status: 404 });

  // Also fetch the report count (how many people report to this employee).
  const reportsCount = await Employee.countDocuments({ managerId: emp._id, status: 'active' });

  return Response.json({ ...toSafe(emp), reportsCount });
}

export async function PATCH(request, { params }) {
  let user;
  try {
    user = await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json({ error: status === 403 ? 'Forbidden' : 'Unauthorized' }, { status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  const { data, error } = validate(updateEmployeeSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  const { id } = await params;
  await connectDB();
  const emp = await Employee.findById(id);
  if (!emp) return Response.json({ error: 'Not found' }, { status: 404 });

  // Prevent self-manager loop.
  if (data.managerId && data.managerId === emp._id.toString()) {
    return Response.json({ error: { managerId: 'Employee cannot be their own manager' } }, { status: 422 });
  }

  // Validate manager: must exist AND have role manager/hr/admin.
  if (data.managerId) {
    const mgr = await Employee.findById(data.managerId).lean();
    if (!mgr) return Response.json({ error: { managerId: 'Manager not found' } }, { status: 422 });
    if (!['manager', 'hr', 'admin'].includes(mgr.role)) {
      return Response.json({ error: { managerId: `Selected employee has role '${mgr.role}' — only manager/hr/admin can be managers` } }, { status: 422 });
    }
  }

  // Apply only the provided fields.
  for (const key of Object.keys(data)) {
    if (key === 'joinDate') {
      emp.joinDate = new Date(data.joinDate);
    } else if (key === 'managerId') {
      emp.managerId = data.managerId || null;
    } else {
      emp[key] = data[key];
    }
  }

  try {
    await emp.save();
    const refreshed = await Employee.findById(emp._id)
      .populate({ path: 'managerId', select: 'firstName lastName email employeeId' })
      .lean();
    return Response.json(toSafe(refreshed));
  } catch (e) {
    if (e.code === 11000) {
      const field = Object.keys(e.keyPattern || {})[0] || 'field';
      return Response.json({ error: { [field]: `${field} already in use` } }, { status: 409 });
    }
    return Response.json({ error: { _: 'Failed to update employee' } }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  // Admin-only soft-delete (set status='inactive'). We never hard-delete employees
  // because attendance + leave records reference them.
  try {
    await requireRole('admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json({ error: status === 403 ? 'Forbidden' : 'Unauthorized' }, { status });
  }

  const { id } = await params;
  await connectDB();
  const emp = await Employee.findById(id);
  if (!emp) return Response.json({ error: 'Not found' }, { status: 404 });

  emp.status = 'inactive';
  await emp.save();
  return Response.json({ id: emp._id.toString(), status: 'inactive' });
}
