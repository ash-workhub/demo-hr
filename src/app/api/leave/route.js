// src/app/api/leave/route.js
// GET  /api/leave      — my leave requests + current balances
// POST /api/leave      — apply for a new leave (self only)
import { connectDB, LeaveRequest, LeaveBalance, Employee, Notification } from '@/lib/db/index.js';
import { requireUser, getSessionEmployee } from '@/lib/auth-helpers.js';
import { createLeaveSchema, validate } from '@/lib/zod-schemas.js';
import { calculateDays, checkBalance } from '@/lib/leave-engine.js';

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

export async function GET(request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectDB();
  const employee = await getSessionEmployee();
  if (!employee) return Response.json({ error: 'No linked employee record' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope') || 'self'; // 'self' | 'pending'
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10);

  // --- Pending approvals queue (manager/hr/admin) ---
  if (scope === 'pending') {
    if (user.role === 'employee') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let filter = {};
    if (user.role === 'manager') {
      // Leaves of my direct reports that are pending_manager
      const reportIds = (await Employee.find({ managerId: employee._id, status: 'active' }).select('_id').lean()).map((e) => e._id);
      filter = {
        employeeId: { $in: reportIds },
        status: 'pending_manager',
      };
    } else {
      // hr + admin: all leaves pending_hr (and also pending_manager for admin visibility)
      filter = user.role === 'admin'
        ? { status: { $in: ['pending_manager', 'pending_hr'] } }
        : { status: 'pending_hr' };
    }

    const pending = await LeaveRequest.find(filter)
      .sort({ createdAt: 1 }) // oldest first (FIFO)
      .limit(100)
      .lean();

    // Batch-load employees
    const empIds = [...new Set(pending.map((lr) => lr.employeeId.toString()))];
    const employees = await Employee.find({ _id: { $in: empIds } }).lean();
    const empMap = new Map(employees.map((e) => [e._id.toString(), e]));

    return Response.json({
      scope: 'pending',
      items: pending.map((lr) => toSafe(lr, empMap.get(lr.employeeId.toString()))),
    });
  }

  // --- Default: my leave requests + current balances ---
  const myRequests = await LeaveRequest.find({ employeeId: employee._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const balance = await LeaveBalance.findOne({ employeeId: employee._id, year });

  return Response.json({
    scope: 'self',
    myRequests: myRequests.map((lr) => toSafe(lr, employee)),
    balance: balance ? {
      year: balance.year,
      casual: balance.casual,
      sick: balance.sick,
      earned: balance.earned,
      unpaid: balance.unpaid,
    } : null,
  });
}

export async function POST(request) {
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

  const { data, error } = validate(createLeaveSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  await connectDB();
  const employee = await getSessionEmployee();
  if (!employee) return Response.json({ error: 'No linked employee record' }, { status: 403 });

  // Calculate days (weekdays only)
  let days;
  try {
    days = calculateDays(data.startDate, data.endDate);
  } catch (e) {
    return Response.json({ error: { _: e.message } }, { status: 422 });
  }

  // Check balance (before submitting — reject early if insufficient)
  const year = new Date(data.startDate).getFullYear();
  let balance = await LeaveBalance.findOne({ employeeId: employee._id, year });
  if (!balance) {
    // Auto-create a default balance for the year if missing
    balance = await LeaveBalance.create({
      employeeId: employee._id,
      year,
      casual: { total: 10, used: 0 },
      sick: { total: 12, used: 0 },
      earned: { total: 15, used: 0 },
      unpaid: { used: 0 },
    });
  }
  const balCheck = checkBalance(
    balance.toObject(),
    data.leaveType,
    days
  );
  if (!balCheck.ok) {
    return Response.json({ error: { _: balCheck.reason, balance: balCheck.balance } }, { status: 422 });
  }

  // Create the leave request — initial state pending_manager
  const lr = await LeaveRequest.create({
    employeeId: employee._id,
    leaveType: data.leaveType,
    startDate: new Date(data.startDate),
    endDate: new Date(data.endDate),
    days,
    reason: data.reason,
    status: 'pending_manager',
    currentApproverRole: employee.managerId ? 'manager' : 'hr', // skip manager if no manager
    history: [{
      action: 'submitted',
      byRole: 'employee',
      note: '',
      fromStatus: '',
      toStatus: 'pending_manager',
      at: new Date(),
    }],
  });

  // Notify the manager (if any) that there's a new leave to approve
  if (employee.managerId) {
    try {
      // Find the manager's user account by employeeId
      const managerUser = await Employee.findById(employee.managerId).lean();
      if (managerUser) {
        const User = (await import('@/lib/db/index.js')).User;
        const mgrUser = await User.findOne({ employeeId: employee.managerId }).lean();
        if (mgrUser) {
          await Notification.create({
            userId: mgrUser._id,
            type: 'leave_submitted',
            title: 'New leave request',
            message: `${employee.firstName} ${employee.lastName} requested ${days} day(s) of ${data.leaveType} leave`,
            link: 'approvals',
            relatedId: lr._id,
            read: false,
          });
        }
      }
    } catch (e) {
      // Notification is best-effort — don't fail the leave creation
      console.error('Failed to create notification:', e.message);
    }
  }

  return Response.json(toSafe(lr, employee), { status: 201 });
}
