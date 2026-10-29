// src/app/api/designations/route.js
// GET  /api/designations   — list (all signed-in users)
// POST /api/designations   — create (hr/admin only)
import { connectDB, Designation, Department } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { createDesignationSchema, validate } from '@/lib/zod-schemas.js';
import { checkDuplicateReference } from '@/lib/org-engine.js';

const COMPANY = 'FegHR Demo';

function toSafe(d) {
  return {
    id: d._id.toString(),
    company: d.company,
    code: d.code,
    name: d.name,
    departmentId: d.departmentId ? d.departmentId.toString() : null,
    status: d.status,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export async function GET(request) {
  try {
    await requireRole('employee', 'manager', 'hr', 'admin');
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await connectDB();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'active';
  const filter = { company: COMPANY };
  if (status && status !== 'all') filter.status = status;
  const items = await Designation.find(filter).sort({ code: 1 }).lean();
  return Response.json({ items: items.map(toSafe) });
}

export async function POST(request) {
  let user;
  try {
    user = await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json({ error: status === 403 ? 'Forbidden' : 'Unauthorized' }, { status });
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  const { data, error } = validate(createDesignationSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  await connectDB();

  // Validate departmentId exists + is active if provided.
  if (data.departmentId) {
    const dept = await Department.findById(data.departmentId).lean();
    if (!dept) return Response.json({ error: { departmentId: 'Department not found' } }, { status: 422 });
    if (dept.status !== 'active') {
      return Response.json({ error: { departmentId: `Department '${dept.name}' is inactive` } }, { status: 422 });
    }
  }

  // Duplicate check.
  const existing = await Designation.find({ company: COMPANY }).lean();
  const dup = checkDuplicateReference(existing, data.code, data.name);
  if (dup.hasDuplicate) {
    return Response.json({ error: { [dup.field]: dup.reason } }, { status: 409 });
  }

  try {
    const created = await Designation.create({ ...data, company: COMPANY });
    return Response.json(toSafe(created), { status: 201 });
  } catch (e) {
    if (e.code === 11000) {
      const field = Object.keys(e.keyPattern || {})[1] || 'field';
      return Response.json({ error: { [field]: `${field} already exists` } }, { status: 409 });
    }
    return Response.json({ error: { _: 'Failed to create designation' } }, { status: 500 });
  }
}
