// src/app/api/departments/route.js
// GET  /api/departments   — list (all signed-in users)
// POST /api/departments   — create (hr/admin only)
import { connectDB, Department, Branch } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { createDepartmentSchema, validate } from '@/lib/zod-schemas.js';
import { checkDuplicateReference } from '@/lib/org-engine.js';

const COMPANY = 'FegHR Demo';

function toSafe(d) {
  return {
    id: d._id.toString(),
    company: d.company,
    code: d.code,
    name: d.name,
    branchId: d.branchId ? d.branchId.toString() : null,
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
  const items = await Department.find(filter).sort({ code: 1 }).lean();
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

  const { data, error } = validate(createDepartmentSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  await connectDB();

  // Validate branchId exists + is active if provided.
  if (data.branchId) {
    const branch = await Branch.findById(data.branchId).lean();
    if (!branch) return Response.json({ error: { branchId: 'Branch not found' } }, { status: 422 });
    if (branch.status !== 'active') {
      return Response.json({ error: { branchId: `Branch '${branch.name}' is inactive` } }, { status: 422 });
    }
  }

  // Duplicate check.
  const existing = await Department.find({ company: COMPANY }).lean();
  const dup = checkDuplicateReference(existing, data.code, data.name);
  if (dup.hasDuplicate) {
    return Response.json({ error: { [dup.field]: dup.reason } }, { status: 409 });
  }

  try {
    const created = await Department.create({ ...data, company: COMPANY });
    return Response.json(toSafe(created), { status: 201 });
  } catch (e) {
    if (e.code === 11000) {
      const field = Object.keys(e.keyPattern || {})[1] || 'field';
      return Response.json({ error: { [field]: `${field} already exists` } }, { status: 409 });
    }
    return Response.json({ error: { _: 'Failed to create department' } }, { status: 500 });
  }
}
