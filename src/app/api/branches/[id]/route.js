// src/app/api/branches/[id]/route.js
// PATCH  /api/branches/:id  — update (hr/admin only)
// DELETE /api/branches/:id  — soft-deactivate (hr/admin only; sets status=inactive)
import { connectDB, Branch } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { updateBranchSchema, validate } from '@/lib/zod-schemas.js';
import { checkDuplicateReference } from '@/lib/org-engine.js';

const COMPANY = 'FegHR Demo';

function toSafe(b) {
  return {
    id: b._id.toString(),
    company: b.company,
    code: b.code,
    name: b.name,
    address: b.address || '',
    status: b.status,
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

  const { data, error } = validate(updateBranchSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  const { id } = await params;
  await connectDB();
  const doc = await Branch.findById(id);
  if (!doc) return Response.json({ error: 'Not found' }, { status: 404 });

  // Duplicate check (exclude self).
  if (data.code || data.name) {
    const existing = await Branch.find({ company: COMPANY }).lean();
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
    return Response.json({ error: { _: 'Failed to update branch' } }, { status: 500 });
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
  const doc = await Branch.findById(id);
  if (!doc) return Response.json({ error: 'Not found' }, { status: 404 });

  // Soft-delete: set status to inactive. We never hard-delete reference records
  // because assignment history references them.
  doc.status = 'inactive';
  await doc.save();
  return Response.json({ id: doc._id.toString(), status: 'inactive' });
}
