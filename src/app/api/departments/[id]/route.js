// src/app/api/departments/[id]/route.js
// PATCH  /api/departments/:id  — update (hr/admin only)
// DELETE /api/departments/:id  — soft-deactivate (hr/admin only)
import { connectDB, Department, Branch } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { updateDepartmentSchema, validate } from '@/lib/zod-schemas.js';
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
  };
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
  try { body = await request.json(); } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  const { data, error } = validate(updateDepartmentSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  const { id } = await params;
  await connectDB();
  const doc = await Department.findById(id);
  if (!doc) return Response.json({ error: 'Not found' }, { status: 404 });

  // Validate branchId if changing.
  if (data.branchId) {
    const branch = await Branch.findById(data.branchId).lean();
    if (!branch) return Response.json({ error: { branchId: 'Branch not found' } }, { status: 422 });
    if (branch.status !== 'active') {
      return Response.json({ error: { branchId: `Branch '${branch.name}' is inactive` } }, { status: 422 });
    }
  }

  // Duplicate check (exclude self).
  if (data.code || data.name) {
    const existing = await Department.find({ company: COMPANY }).lean();
    const dup = checkDuplicateReference(existing, data.code || doc.code, data.name || doc.name, id);
    if (dup.hasDuplicate) {
      return Response.json({ error: { [dup.field]: dup.reason } }, { status: 409 });
    }
  }

  for (const key of Object.keys(data)) doc[key] = data[key];
  try {
    await doc.save();
    return Response.json(toSafe(doc));
  } catch (e) {
    if (e.code === 11000) {
      const field = Object.keys(e.keyPattern || {})[1] || 'field';
      return Response.json({ error: { [field]: `${field} already exists` } }, { status: 409 });
    }
    return Response.json({ error: { _: 'Failed to update department' } }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json({ error: status === 403 ? 'Forbidden' : 'Unauthorized' }, { status });
  }

  const { id } = await params;
  await connectDB();
  const doc = await Department.findById(id);
  if (!doc) return Response.json({ error: 'Not found' }, { status: 404 });

  doc.status = 'inactive';
  await doc.save();
  return Response.json({ id: doc._id.toString(), status: 'inactive' });
}
