// src/app/api/leave/policies/[id]/route.js
// PATCH  /api/leave/policies/:id  — update (hr/admin only)
// DELETE /api/leave/policies/:id  — soft-deactivate (hr/admin only)
//
// IMPORTANT: Policy edits affect NEW submissions only. Pending leave requests
// keep their frozen routeSnapshot — never rewritten.
import { connectDB, ApprovalPolicy } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { updateApprovalPolicySchema, validate } from '@/lib/zod-schemas.js';

function toSafe(p) {
  return {
    id: p._id.toString(),
    name: p.name,
    effectiveDate: p.effectiveDate,
    endDate: p.endDate,
    managerStages: p.managerStages,
    finalApproverRole: p.finalApproverRole,
    status: p.status,
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

  const { data, error } = validate(updateApprovalPolicySchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  const { id } = await params;
  await connectDB();
  const doc = await ApprovalPolicy.findById(id);
  if (!doc) return Response.json({ error: 'Not found' }, { status: 404 });

  for (const key of Object.keys(data)) doc[key] = data[key];
  await doc.save();
  return Response.json(toSafe(doc));
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
  const doc = await ApprovalPolicy.findById(id);
  if (!doc) return Response.json({ error: 'Not found' }, { status: 404 });

  doc.status = 'inactive';
  await doc.save();
  return Response.json({ id: doc._id.toString(), status: 'inactive' });
}
