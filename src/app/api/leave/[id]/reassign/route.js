// src/app/api/leave/[id]/reassign/route.js
// POST /api/leave/:id/reassign  — reassign an unavailable approver (hr/admin only)
//
// Reassignment:
//   1. Validates the current approver at the specified stage matches expectedCurrentApproverId
//   2. Validates the new approver is active + has role manager/hr/admin (for manager stages)
//   3. Updates routeSnapshot[stage].approverId + approverName
//   4. Appends to reassignmentHistory[] (append-only audit, never overwrites)
//   5. Does NOT change currentStage or status — the leave stays at its current stage
import { connectDB, LeaveRequest, Employee } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { reassignApproverSchema, validate } from '@/lib/zod-schemas.js';

export async function POST(request, { params }) {
  let user;
  try {
    user = await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json({ error: status === 403 ? 'Forbidden — only HR/Admin can reassign approvers' : 'Unauthorized' }, { status });
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  const { data, error } = validate(reassignApproverSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  const { id } = await params;
  await connectDB();

  const lr = await LeaveRequest.findById(id);
  if (!lr) return Response.json({ error: 'Not found' }, { status: 404 });

  // V2 requests only — V1 requests don't have a routeSnapshot.
  if (!lr.routeSnapshot || lr.routeSnapshot.length === 0) {
    return Response.json({ error: { _: 'This request has no route snapshot (V1 request — reassignment not available)' } }, { status: 422 });
  }

  // Validate the stage index.
  if (data.stage < 0 || data.stage >= lr.routeSnapshot.length) {
    return Response.json({ error: { stage: `Invalid stage ${data.stage} (route has ${lr.routeSnapshot.length} stages)` } }, { status: 422 });
  }

  const stageEntry = lr.routeSnapshot[data.stage];

  // Only manager stages can be reassigned (HR/Admin stage is role-based, not person-based).
  if (stageEntry.type !== 'manager') {
    return Response.json({ error: { stage: 'Only manager stages can be reassigned (the HR/Admin stage is role-based)' } }, { status: 422 });
  }

  // Validate expected-current-approver: must match the current approver at this stage.
  const currentApproverId = stageEntry.approverId ? stageEntry.approverId.toString() : null;
  if (currentApproverId !== data.expectedCurrentApproverId) {
    return Response.json({
      error: { expectedCurrentApproverId: `Expected approver ${data.expectedCurrentApproverId} but current approver is ${currentApproverId || 'none'}` },
    }, { status: 422 });
  }

  // Validate the new approver exists + is active + has appropriate role.
  const newApprover = await Employee.findById(data.newApproverId).lean();
  if (!newApprover) return Response.json({ error: { newApproverId: 'New approver not found' } }, { status: 422 });
  if (newApprover.status !== 'active') {
    return Response.json({ error: { newApproverId: `New approver '${newApprover.firstName} ${newApprover.lastName}' is inactive` } }, { status: 422 });
  }
  if (!['manager', 'hr', 'admin'].includes(newApprover.role)) {
    return Response.json({ error: { newApproverId: `New approver has role '${newApprover.role}' — only manager/hr/admin can be approvers` } }, { status: 422 });
  }

  // No self-approval: the new approver can't be the leave owner.
  if (newApprover._id.toString() === lr.employeeId.toString()) {
    return Response.json({ error: { newApproverId: 'Cannot reassign to the leave owner (self-approval blocked)' } }, { status: 422 });
  }

  // No duplicate: the new approver can't already be in the route (except at the stage being reassigned).
  for (let i = 0; i < lr.routeSnapshot.length; i++) {
    if (i === data.stage) continue;
    const s = lr.routeSnapshot[i];
    if (s.type === 'manager' && s.approverId && s.approverId.toString() === data.newApproverId) {
      return Response.json({ error: { newApproverId: 'New approver already appears at another stage (duplicate/cyclic route)' } }, { status: 422 });
    }
  }

  // Perform the reassignment.
  const oldApproverId = currentApproverId;
  const oldApproverName = stageEntry.approverName || '';
  const newApproverName = `${newApprover.firstName} ${newApprover.lastName}`;

  // Update the routeSnapshot stage entry.
  lr.routeSnapshot[data.stage].approverId = newApprover._id;
  lr.routeSnapshot[data.stage].approverName = newApproverName;
  lr.markModified('routeSnapshot');

  // Append to reassignmentHistory (append-only — never overwrites).
  lr.reassignmentHistory.push({
    stage: data.stage,
    fromApproverId: oldApproverId,
    fromApproverName: oldApproverName,
    toApproverId: newApprover._id.toString(),
    toApproverName: newApproverName,
    reason: data.reason,
    by: user.id,
    byName: user.name || '',
    at: new Date(),
  });

  await lr.save();

  return Response.json({
    id: lr._id.toString(),
    stage: data.stage,
    oldApproverId,
    oldApproverName,
    newApproverId: newApprover._id.toString(),
    newApproverName,
    reassignmentCount: lr.reassignmentHistory.length,
  });
}
