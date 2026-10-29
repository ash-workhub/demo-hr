// src/app/api/leave/[id]/action/route.js
// POST /api/leave/:id/action   — approve or reject
//
// V2 Step 4: If the leave has a routeSnapshot (V2 request), uses the snapshot-based
// flow: only the assigned person at routeSnapshot[currentStage] can act. Approval
// advances exactly one stage; rejection is final. Final approval rechecks balance.
// V1 requests (no routeSnapshot) use the original hardcoded flow (unchanged).
import { connectDB, LeaveRequest, LeaveBalance, LeaveAdjustment, LeaveType, Employee, Notification, User } from '@/lib/db/index.js';
import { requireUser, getSessionEmployee } from '@/lib/auth-helpers.js';
import { leaveActionSchema, validate } from '@/lib/zod-schemas.js';
import { transition, isActive, applyApprovalToBalance } from '@/lib/leave-engine.js';
import { canActAtStage, advanceStage, isFinalStage } from '@/lib/approval-policy-engine.js';
import { checkBalanceV2, sumAdjustments } from '@/lib/leave-balance-engine.js';
import { createNotification } from '@/lib/notifications.js';

function toSafe(lr, employee) {
  return {
    id: lr._id.toString(),
    status: lr.status,
    currentApproverRole: lr.currentApproverRole,
    managerAction: lr.managerAction,
    hrAction: lr.hrAction,
    // V2 Step 4 — route snapshot + current stage
    routeSnapshot: lr.routeSnapshot || [],
    currentStage: lr.currentStage,
    reassignmentHistory: lr.reassignmentHistory || [],
    history: (lr.history || []).map((h) => ({
      action: h.action,
      byRole: h.byRole,
      note: h.note,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      at: h.at,
    })),
    employee: employee ? {
      id: employee._id.toString(),
      fullName: `${employee.firstName} ${employee.lastName}`,
      employeeCode: employee.employeeId,
      email: employee.email,
    } : undefined,
  };
}

export async function POST(request, { params }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only manager/hr/admin can act on approvals
  if (user.role === 'employee') {
    return Response.json({ error: 'Forbidden — employees cannot approve/reject' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  const { data, error } = validate(leaveActionSchema, body);
  if (error) {
    
    return Response.json({ error }, { status: 422 });
  }

  const engineAction = data.decision === 'approved' ? 'approve' : 'reject';

  const { id } = await params;
  await connectDB();

  const lr = await LeaveRequest.findById(id);
  if (!lr) return Response.json({ error: 'Not found' }, { status: 404 });

  if (!isActive(lr.status)) {
    return Response.json({ error: { _: `Leave is already in final state: ${lr.status}` } }, { status: 422 });
  }

  const employee = await getSessionEmployee();
  const owner = await Employee.findById(lr.employeeId).lean();

  // ============================================================
  // V2 Step 4 — snapshot-based flow (if routeSnapshot exists)
  // ============================================================
  if (lr.routeSnapshot && lr.routeSnapshot.length > 0 && lr.currentStage !== null) {
    // Check if the actor can act at the current stage.
    const canAct = canActAtStage(lr.routeSnapshot, lr.currentStage, {
      actorEmployeeId: employee ? employee._id.toString() : null,
      actorRole: user.role,
      ownerEmployeeId: owner._id.toString(),
    });
    if (!canAct.ok) {
      return Response.json({ error: canAct.error }, { status: 403 });
    }

    const fromStatus = lr.status;
    const currentStageEntry = lr.routeSnapshot[lr.currentStage];

    if (engineAction === 'reject') {
      // Rejection is final — no advance.
      lr.routeSnapshot[lr.currentStage].status = 'rejected';
      lr.routeSnapshot[lr.currentStage].decidedAt = new Date();
      lr.routeSnapshot[lr.currentStage].decidedBy = user.id;
      lr.routeSnapshot[lr.currentStage].note = data.note || '';
      lr.markModified('routeSnapshot');

      lr.status = 'rejected';
      lr.currentApproverRole = null;

      // Record the action
      const actionRecord = {
        by: user.id, byRole: user.role, decision: 'rejected',
        note: data.note || '', at: new Date(),
      };
      if (currentStageEntry.type === 'manager') lr.managerAction = actionRecord;
      else lr.hrAction = actionRecord;

      lr.history.push({
        action: currentStageEntry.type === 'manager' ? 'manager_rejected' : 'hr_rejected',
        by: user.id, byRole: user.role, note: data.note || '',
        fromStatus, toStatus: 'rejected', at: new Date(),
      });

      await lr.save();

      // Notify the employee
      await notifyEmployee(lr, owner, 'rejected', data.note);

      return Response.json(toSafe(lr, owner));
    }

    // --- Approve ---
    lr.routeSnapshot[lr.currentStage].status = 'approved';
    lr.routeSnapshot[lr.currentStage].decidedAt = new Date();
    lr.routeSnapshot[lr.currentStage].decidedBy = user.id;
    lr.routeSnapshot[lr.currentStage].note = data.note || '';
    lr.markModified('routeSnapshot');

    // Record the action
    const actionRecord = {
      by: user.id, byRole: user.role, decision: 'approved',
      note: data.note || '', at: new Date(),
    };
    if (currentStageEntry.type === 'manager') lr.managerAction = actionRecord;
    else lr.hrAction = actionRecord;

    // Check if this was the final stage.
    const nextStage = advanceStage(lr.routeSnapshot, lr.currentStage);

    if (nextStage === null) {
      // --- Final approval: recheck balance before decrementing ---
      const year = new Date(lr.startDate).getFullYear();
      const balance = await LeaveBalance.findOne({ employeeId: lr.employeeId, year }).lean();
      const adjustments = await LeaveAdjustment.find({ employeeId: lr.employeeId, year }).lean();
      const leaveTypeDoc = await LeaveType.findOne({ company: 'FegHR Demo', code: lr.leaveType }).lean();
      const isUnlimited = leaveTypeDoc?.isUnlimited || lr.leaveType === 'unpaid';

      const bucket = balance?.[lr.leaveType] || {};
      const quota = bucket.total != null ? bucket.total : (leaveTypeDoc?.defaultQuota || 0);
      const used = bucket.used || 0;
      const adjustmentsTotal = sumAdjustments(adjustments, lr.leaveType, year);

      const recheck = checkBalanceV2({
        quota, adjustmentsTotal, used, pending: 0, isUnlimited, days: lr.days,
      });
      if (!recheck.ok) {
        // Balance recheck failed — don't approve. Leave stays at current stage.
        // Revert the stage status to pending.
        lr.routeSnapshot[lr.currentStage].status = 'pending';
        lr.routeSnapshot[lr.currentStage].decidedAt = null;
        lr.routeSnapshot[lr.currentStage].decidedBy = null;
        lr.routeSnapshot[lr.currentStage].note = '';
        lr.markModified('routeSnapshot');
        // Revert the action record
        if (currentStageEntry.type === 'manager') lr.managerAction = null;
        else lr.hrAction = null;

        return Response.json({
          error: { _: `Balance recheck failed at final approval: ${recheck.reason}` },
        }, { status: 422 });
      }

      // Balance OK — finalize.
      lr.status = 'approved';
      lr.currentApproverRole = null;
      lr.currentStage = null;

      lr.history.push({
        action: currentStageEntry.type === 'manager' ? 'manager_approved' : 'hr_approved',
        by: user.id, byRole: user.role, note: data.note || '',
        fromStatus, toStatus: 'approved', at: new Date(),
      });

      await lr.save();

      // Decrement balance.
      const balanceDoc = await LeaveBalance.findOne({ employeeId: lr.employeeId, year });
      if (balanceDoc) {
        const updated = applyApprovalToBalance(balanceDoc.toObject(), lr.leaveType, lr.days);
        balanceDoc.casual = updated.casual;
        balanceDoc.sick = updated.sick;
        balanceDoc.earned = updated.earned;
        balanceDoc.unpaid = updated.unpaid;
        await balanceDoc.save();
      }

      await notifyEmployee(lr, owner, 'approved', data.note);
      return Response.json(toSafe(lr, owner));
    }

    // --- Advance to next stage (not final) ---
    lr.currentStage = nextStage;
    const nextStageEntry = lr.routeSnapshot[nextStage];
    lr.status = nextStageEntry.type === 'hr_admin' ? 'pending_hr' : 'pending_manager';
    lr.currentApproverRole = nextStageEntry.type === 'hr_admin' ? nextStageEntry.approverRole : 'manager';

    lr.history.push({
      action: currentStageEntry.type === 'manager' ? 'manager_approved' : 'hr_approved',
      by: user.id, byRole: user.role, note: data.note || '',
      fromStatus, toStatus: lr.status, at: new Date(),
    });

    await lr.save();
    await notifyEmployee(lr, owner, 'advanced', data.note, nextStageEntry);
    return Response.json(toSafe(lr, owner));
  }

  // ============================================================
  // V1 fallback — hardcoded 2-stage flow (for requests without routeSnapshot)
  // ============================================================

  // Self-approval block
  if (employee && owner && employee._id.toString() === owner._id.toString()) {
    return Response.json({ error: 'Forbidden — you cannot approve or reject your own leave request' }, { status: 403 });
  }

  if (lr.status === 'pending_manager') {
    const isDirectManager = employee && owner.managerId && owner.managerId.toString() === employee._id.toString();
    const isAdmin = user.role === 'admin';
    if (!isDirectManager && !isAdmin) {
      return Response.json({ error: 'Forbidden — only the direct manager (or admin) can act at this stage' }, { status: 403 });
    }
  } else if (lr.status === 'pending_hr') {
    const isHr = user.role === 'hr';
    const isAdmin = user.role === 'admin';
    if (!isHr && !isAdmin) {
      return Response.json({ error: 'Forbidden — only HR (or admin) can act at this stage' }, { status: 403 });
    }
  }

  const result = transition(lr.status, engineAction, user.role);
  if (result.error) {
    return Response.json({ error: { _: result.error } }, { status: 422 });
  }

  const fromStatus = lr.status;
  lr.status = result.nextStatus;
  lr.currentApproverRole = result.nextStatus === 'pending_hr' ? 'hr' : (result.nextStatus === 'approved' ? null : null);

  const actionRecord = {
    by: user.id, byRole: user.role, decision: data.decision,
    note: data.note || '', at: new Date(),
  };
  if (fromStatus === 'pending_manager') lr.managerAction = actionRecord;
  else lr.hrAction = actionRecord;

  lr.history.push({
    action: result.historyAction, by: user.id, byRole: user.role,
    note: data.note || '', fromStatus, toStatus: result.nextStatus, at: new Date(),
  });

  await lr.save();

  if (result.nextStatus === 'approved') {
    const year = new Date(lr.startDate).getFullYear();
    const balance = await LeaveBalance.findOne({ employeeId: lr.employeeId, year });
    if (balance) {
      const updated = applyApprovalToBalance(balance.toObject(), lr.leaveType, lr.days);
      balance.casual = updated.casual;
      balance.sick = updated.sick;
      balance.earned = updated.earned;
      balance.unpaid = updated.unpaid;
      await balance.save();
    }
  }

  // Notify the employee
  try {
    const ownerUser = await User.findOne({ employeeId: lr.employeeId.toString() }).lean();
    if (ownerUser) {
      const approved = result.nextStatus === 'approved';
      const movedToHr = result.nextStatus === 'pending_hr';
      let type, title, message;
      if (approved) {
        type = 'leave_hr_approved'; title = 'Leave approved';
        message = `Your ${lr.leaveType} leave (${lr.days} day(s)) has been approved by HR`;
      } else if (movedToHr) {
        type = 'leave_manager_approved'; title = 'Leave approved by manager';
        message = `Your ${lr.leaveType} leave moved to HR for final approval`;
      } else {
        type = 'leave_rejected'; title = 'Leave rejected';
        message = `Your ${lr.leaveType} leave was rejected${data.note ? `: ${data.note}` : ''}`;
      }
      await createNotification({
        userId: ownerUser._id, type, title, message,
        link: 'leave', relatedId: lr._id,
      });
    }
  } catch (e) {
    console.error('Failed to notify employee:', e.message);
  }

  return Response.json(toSafe(lr, owner));
}

// Helper: notify the employee about the decision (V2 flow)
async function notifyEmployee(lr, owner, outcome, note, nextStageEntry) {
  try {
    const ownerUser = await User.findOne({ employeeId: lr.employeeId.toString() }).lean();
    if (!ownerUser) return;

    let type, title, message;
    if (outcome === 'approved') {
      type = 'leave_hr_approved'; title = 'Leave approved';
      message = `Your ${lr.leaveType} leave (${lr.days} day(s)) has been fully approved`;
    } else if (outcome === 'advanced') {
      type = 'leave_manager_approved'; title = 'Leave advanced to next stage';
      const nextLabel = nextStageEntry?.type === 'hr_admin'
        ? (nextStageEntry.approverRole === 'admin' ? 'Admin' : 'HR')
        : nextStageEntry?.approverName || 'next manager';
      message = `Your ${lr.leaveType} leave moved to ${nextLabel} for approval`;
    } else {
      type = 'leave_rejected'; title = 'Leave rejected';
      message = `Your ${lr.leaveType} leave was rejected${note ? `: ${note}` : ''}`;
    }
    await createNotification({
      userId: ownerUser._id, type, title, message,
      link: 'leave', relatedId: lr._id,
    });
  } catch (e) {
    console.error('Failed to notify employee:', e.message);
  }
}
