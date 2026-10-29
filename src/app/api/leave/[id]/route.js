// src/app/api/leave/[id]/route.js
// GET   /api/leave/:id   — single leave detail (owner or approver)
// PATCH /api/leave/:id   — cancel (owner only, only if active)
import { connectDB, LeaveRequest, LeaveBalance, Employee } from '@/lib/db/index.js';
import { requireUser, getSessionEmployee } from '@/lib/auth-helpers.js';
import { transition, isActive, applyApprovalToBalance } from '@/lib/leave-engine.js';

function toSafe(lr, employee) {
  return {
    id: lr._id.toString(),
    employeeId: lr.employeeId ? lr.employeeId.toString() : null,
    leaveType: lr.leaveType,
    startDate: lr.startDate,
    endDate: lr.endDate,
    days: lr.days,
    reason: lr.reason,
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
    createdAt: lr.createdAt,
    updatedAt: lr.updatedAt,
    employee: employee ? {
      id: employee._id.toString(),
      fullName: `${employee.firstName} ${employee.lastName}`,
      employeeCode: employee.employeeId,
      department: employee.department,
      avatarColor: employee.avatarColor,
    } : undefined,
  };
}

export async function GET(request, { params }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  await connectDB();

  const lr = await LeaveRequest.findById(id).lean();
  if (!lr) return Response.json({ error: 'Not found' }, { status: 404 });

  // Permission: owner, their manager, hr, or admin can view
  const employee = await getSessionEmployee();
  const isOwner = employee && lr.employeeId.toString() === employee._id.toString();
  const isManagerOfOwner = employee && lr.employeeId && (await Employee.findById(lr.employeeId).lean())?.managerId?.toString() === employee._id.toString();
  const isPrivileged = user.role === 'hr' || user.role === 'admin';

  if (!isOwner && !isManagerOfOwner && !isPrivileged) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const owner = await Employee.findById(lr.employeeId).lean();
  return Response.json(toSafe(lr, owner));
}

export async function PATCH(request, { params }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  if (body.action !== 'cancel') {
    return Response.json({ error: { _: 'Only "cancel" action is supported via PATCH' } }, { status: 422 });
  }

  const { id } = await params;
  await connectDB();

  const lr = await LeaveRequest.findById(id);
  if (!lr) return Response.json({ error: 'Not found' }, { status: 404 });

  // Only the owner can cancel
  const employee = await getSessionEmployee();
  if (!employee || lr.employeeId.toString() !== employee._id.toString()) {
    return Response.json({ error: 'Forbidden — only the owner can cancel' }, { status: 403 });
  }

  const result = transition(lr.status, 'cancel', 'employee');
  if (result.error) {
    return Response.json({ error: { _: result.error } }, { status: 422 });
  }

  const fromStatus = lr.status;
  lr.status = result.nextStatus;
  lr.currentApproverRole = null;
  lr.history.push({
    action: 'cancelled',
    byRole: 'employee',
    note: body.note || '',
    fromStatus,
    toStatus: result.nextStatus,
    at: new Date(),
  });
  await lr.save();

  const owner = await Employee.findById(lr.employeeId).lean();
  return Response.json(toSafe(lr, owner));
}
