// src/app/api/leave/[id]/action/route.js
// POST /api/leave/:id/action   — approve or reject (manager at stage 1, hr at stage 2)
import { connectDB, LeaveRequest, LeaveBalance, Employee, Notification, User } from '@/lib/db/index.js';
import { requireUser, getSessionEmployee } from '@/lib/auth-helpers.js';
import { leaveActionSchema, validate } from '@/lib/zod-schemas.js';
import { transition, isActive, applyApprovalToBalance } from '@/lib/leave-engine.js';
import { createNotification } from '@/lib/notifications.js';

function toSafe(lr, employee) {
  return {
    id: lr._id.toString(),
    status: lr.status,
    currentApproverRole: lr.currentApproverRole,
    managerAction: lr.managerAction,
    hrAction: lr.hrAction,
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
  if (error) return Response.json({ error }, { status: 422 });

  // Translate API vocabulary ('approved'/'rejected') to engine vocabulary ('approve'/'reject').
  const engineAction = data.decision === 'approved' ? 'approve' : 'reject';

  const { id } = await params;
  await connectDB();

  const lr = await LeaveRequest.findById(id);
  if (!lr) return Response.json({ error: 'Not found' }, { status: 404 });

  if (!isActive(lr.status)) {
    return Response.json({ error: { _: `Leave is already in final state: ${lr.status}` } }, { status: 422 });
  }

  // Permission check: at pending_manager, only the employee's direct manager (or admin) can act.
  // At pending_hr, only HR (or admin) can act.
  const employee = await getSessionEmployee();
  const owner = await Employee.findById(lr.employeeId).lean();

  // Self-approval block: the leave owner cannot act on their own leave, even if they
  // happen to be HR or an admin. This prevents an HR user from approving their own leave.
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

  // Run the state-machine transition
  const result = transition(lr.status, engineAction, user.role);
  if (result.error) {
    return Response.json({ error: { _: result.error } }, { status: 422 });
  }

  const fromStatus = lr.status;
  lr.status = result.nextStatus;
  lr.currentApproverRole = result.nextStatus === 'pending_hr' ? 'hr' : (result.nextStatus === 'approved' ? null : null);

  // Record the action
  const actionRecord = {
    by: user.id,
    byRole: user.role,
    decision: data.decision,
    note: data.note || '',
    at: new Date(),
  };
  if (fromStatus === 'pending_manager') lr.managerAction = actionRecord;
  else lr.hrAction = actionRecord;

  // Append to history
  lr.history.push({
    action: result.historyAction,
    by: user.id,
    byRole: user.role,
    note: data.note || '',
    fromStatus,
    toStatus: result.nextStatus,
    at: new Date(),
  });

  await lr.save();

  // If finally approved, decrement the leave balance
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

  // Notify the employee about the decision
  try {
    // User.employeeId is stored as a string (Better Auth), so cast ObjectId to string.
    const ownerUser = await User.findOne({ employeeId: lr.employeeId.toString() }).lean();
    if (ownerUser) {
      const approved = result.nextStatus === 'approved';
      const movedToHr = result.nextStatus === 'pending_hr';
      let type, title, message;
      if (approved) {
        type = 'leave_hr_approved';
        title = 'Leave approved';
        message = `Your ${lr.leaveType} leave (${lr.days} day(s)) has been approved by HR`;
      } else if (movedToHr) {
        type = 'leave_manager_approved';
        title = 'Leave approved by manager';
        message = `Your ${lr.leaveType} leave moved to HR for final approval`;
      } else {
        type = 'leave_rejected';
        title = 'Leave rejected';
        message = `Your ${lr.leaveType} leave was rejected${data.note ? `: ${data.note}` : ''}`;
      }
      await createNotification({
        userId: ownerUser._id,
        type,
        title,
        message,
        link: 'leave',
        relatedId: lr._id,
      });
    }
  } catch (e) {
    console.error('Failed to notify employee:', e.message);
  }

  return Response.json(toSafe(lr, owner));
}
