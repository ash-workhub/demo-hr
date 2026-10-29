// src/app/api/leave/route.js
// GET  /api/leave      — my leave requests + current balances
// POST /api/leave      — apply for a new leave (self only, OR hr/admin on behalf)
//
// V2 Step 3: POST now accepts optional `onBehalfOf` (employeeId). If set,
// requires hr/admin role. Records HR actor + employee separately. Still enters
// normal approval route (pending_manager → pending_hr → approved).
import { connectDB, LeaveRequest, LeaveBalance, LeaveAdjustment, LeaveType, ApprovalPolicy, Employee, Notification } from '@/lib/db/index.js';
import { requireUser, requireRole, getSessionEmployee } from '@/lib/auth-helpers.js';
import { createLeaveSchema, createLeaveOnBehalfSchema, validate } from '@/lib/zod-schemas.js';
import { calculateDays, checkBalanceWithReservation, checkOverlap } from '@/lib/leave-engine.js';
import { checkBalanceV2, sumAdjustments } from '@/lib/leave-balance-engine.js';
import { resolveRoute, buildManagementChain } from '@/lib/approval-policy-engine.js';
import { createNotification } from '@/lib/notifications.js';

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
    // V2 Step 3 — on-behalf audit
    appliedBy: lr.appliedBy ? lr.appliedBy.toString() : null,
    appliedByName: lr.appliedByName || '',
    appliedOnBehalf: lr.appliedOnBehalf || false,
    // V2 Step 4 — route snapshot + current stage
    routeSnapshot: lr.routeSnapshot || [],
    currentStage: lr.currentStage,
    reassignmentHistory: lr.reassignmentHistory || [],
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

  // V2 Step 3 — determine if this is an on-behalf application.
  const isOnBehalf = !!body.onBehalfOf;
  let targetEmployee;
  let appliedBy = null;
  let appliedByName = '';
  let appliedOnBehalf = false;

  if (isOnBehalf) {
    // HR/Admin apply on behalf — require elevated role.
    try {
      await requireRole('hr', 'admin');
    } catch (e) {
      const status = e instanceof Response ? e.status : 401;
      return Response.json({ error: status === 403 ? 'Forbidden — only HR/Admin can apply on behalf' : 'Unauthorized' }, { status });
    }
    const { data, error } = validate(createLeaveOnBehalfSchema, body);
    if (error) return Response.json({ error }, { status: 422 });
    // Use the on-behind schema's data going forward.
    body = { ...data, leaveType: data.leaveType };
  } else {
    const { data, error } = validate(createLeaveSchema, body);
    if (error) return Response.json({ error }, { status: 422 });
    body = data;
  }

  await connectDB();

  // Resolve the target employee (self, or the on-behalf employee).
  if (isOnBehalf) {
    targetEmployee = await Employee.findById(body.onBehalfOf);
    if (!targetEmployee) return Response.json({ error: { onBehalfOf: 'Employee not found' } }, { status: 422 });
    appliedBy = user.id;
    appliedByName = user.name || '';
    appliedOnBehalf = true;
  } else {
    targetEmployee = await getSessionEmployee();
    if (!targetEmployee) return Response.json({ error: 'No linked employee record' }, { status: 403 });
  }

  // Calculate days (weekdays only, with optional half-day for single-day leaves)
  let days;
  try {
    days = calculateDays(body.startDate, body.endDate, body.isHalfDay);
  } catch (e) {
    return Response.json({ error: { _: e.message } }, { status: 422 });
  }

  // --- Overlap check: reject if there's an existing active/approved leave covering the same dates ---
  const existingLeaves = await LeaveRequest.find({ employeeId: targetEmployee._id }).lean();
  const overlap = checkOverlap(existingLeaves, body.startDate, body.endDate);
  if (overlap.overlaps) {
    const c = overlap.conflictingLeave;
    const fmtStart = new Date(c.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const fmtEnd = new Date(c.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return Response.json({
      error: {
        _: `Leave overlaps with an existing ${c.status.replace('_', ' ')} leave (${fmtStart} → ${fmtEnd})`,
      },
    }, { status: 422 });
  }

  // --- V2 Step 3 balance check: use V2 reconciliation (quota + adjustments - used - pending) ---
  const year = new Date(body.startDate).getFullYear();
  let balance = await LeaveBalance.findOne({ employeeId: targetEmployee._id, year });
  if (!balance) {
    // Auto-create a default balance for the year if missing
    balance = await LeaveBalance.create({
      employeeId: targetEmployee._id,
      year,
      casual: { total: 10, used: 0 },
      sick: { total: 12, used: 0 },
      earned: { total: 15, used: 0 },
      unpaid: { used: 0 },
      adjustmentsTotal: { casual: 0, sick: 0, earned: 0, unpaid: 0 },
    });
  }

  const pendingLeaves = existingLeaves.filter(
    (l) => l.status === 'pending_manager' || l.status === 'pending_hr'
  );

  // Look up the leave type config (for isUnlimited + defaultQuota).
  const leaveTypeDoc = await LeaveType.findOne({ company: 'FegHR Demo', code: body.leaveType }).lean();
  const isUnlimited = leaveTypeDoc?.isUnlimited || body.leaveType === 'unpaid';

  // V2 reconciliation: use adjustments from the ledger.
  const adjustments = await LeaveAdjustment.find({ employeeId: targetEmployee._id, year }).lean();
  const adjustmentsTotal = sumAdjustments(adjustments, body.leaveType, year);
  const bucket = balance[body.leaveType] || {};
  const quota = bucket.total != null ? bucket.total : (leaveTypeDoc?.defaultQuota || 0);
  const used = bucket.used || 0;
  const pendingDays = pendingLeaves
    .filter((l) => l.leaveType === body.leaveType)
    .reduce((sum, l) => sum + (l.days || 0), 0);

  const balCheck = checkBalanceV2({
    quota,
    adjustmentsTotal,
    used,
    pending: pendingDays,
    isUnlimited,
    days,
  });
  if (!balCheck.ok) {
    return Response.json({ error: { _: balCheck.reason, balance: balCheck.balance } }, { status: 422 });
  }

  // V2 Step 4 — resolve the approval route from the active policy + snapshot it.
  // This snapshot is FROZEN — policy edits after submission don't affect pending requests.
  const activePolicy = await ApprovalPolicy.findOne({ company: 'FegHR Demo', endDate: null, status: 'active' }).lean();
  let routeSnapshot = [];
  let currentStage = null;

  if (activePolicy) {
    // Build the management chain by walking up from the target employee.
    const allManagers = await Employee.find({ status: 'active' }).select('_id firstName lastName role status managerId').lean();
    const employeeMap = new Map(allManagers.map((e) => [e._id.toString(), e]));
    const managementChain = buildManagementChain(targetEmployee, employeeMap);

    // V2 Step 6 regression fix: if the policy requires manager stages but the
    // employee has no manager (e.g., HR/Admin/top-level), reduce the effective
    // managerStages to match the available chain length. This mirrors the V1
    // fallback behavior (skip manager → go straight to HR) without changing
    // the policy itself.
    const effectiveManagerStages = Math.min(activePolicy.managerStages, managementChain.length);

    const routeResult = resolveRoute({
      employeeId: targetEmployee._id.toString(),
      managementChain,
      policy: { ...activePolicy, managerStages: effectiveManagerStages },
    });

    if (routeResult.error) {
      return Response.json({ error: { _: `Approval route error: ${routeResult.error}` } }, { status: 422 });
    }

    routeSnapshot = routeResult.route;
    currentStage = 0; // start at the first stage
  }
  // If no active policy, V1 fallback: routeSnapshot stays empty, currentStage stays null.
  // The V1 hardcoded pending_manager → pending_hr flow handles these requests.

  // V1 compat: determine the initial status + currentApproverRole.
  // For V2 requests with routeSnapshot, use the first stage's type.
  // For V1 fallback, use the original logic.
  let initialStatus, initialApproverRole;
  if (routeSnapshot.length > 0) {
    const firstStage = routeSnapshot[0];
    if (firstStage.type === 'hr_admin') {
      initialStatus = 'pending_hr';
      initialApproverRole = firstStage.approverRole;
    } else {
      initialStatus = 'pending_manager';
      initialApproverRole = 'manager';
    }
  } else {
    // V1 fallback
    initialStatus = 'pending_manager';
    initialApproverRole = targetEmployee.managerId ? 'manager' : 'hr';
  }

  // Create the leave request
  const lr = await LeaveRequest.create({
    employeeId: targetEmployee._id,
    leaveType: body.leaveType,
    startDate: new Date(body.startDate),
    endDate: new Date(body.endDate),
    days,
    reason: body.reason,
    status: initialStatus,
    currentApproverRole: initialApproverRole,
    // V2 Step 3 — on-behalf audit
    appliedBy,
    appliedByName,
    appliedOnBehalf,
    // V2 Step 4 — frozen route snapshot
    routeSnapshot,
    currentStage,
    reassignmentHistory: [],
    history: [{
      action: 'submitted',
      byRole: isOnBehalf ? user.role : 'employee',
      note: isOnBehalf ? `Applied on behalf by ${appliedByName} (${user.role})` : '',
      fromStatus: '',
      toStatus: initialStatus,
      at: new Date(),
    }],
  });

  // Notify the manager (if any) that there's a new leave to approve
  if (targetEmployee.managerId) {
    try {
      const { User } = await import('@/lib/db/index.js');
      // User.employeeId is stored as a string (Better Auth), so cast ObjectId to string.
      const mgrUser = await User.findOne({ employeeId: targetEmployee.managerId.toString() }).lean();
      if (mgrUser) {
        const onBehalfPrefix = isOnBehalf ? '[On behalf] ' : '';
        await createNotification({
          userId: mgrUser._id,
          type: 'leave_submitted',
          title: `${onBehalfPrefix}New leave request`,
          message: `${targetEmployee.firstName} ${targetEmployee.lastName} requested ${days} day(s) of ${body.leaveType} leave`,
          link: 'approvals',
          relatedId: lr._id,
        });
      }
    } catch (e) {
      // Notification is best-effort — don't fail the leave creation
      console.error('Failed to create notification:', e.message);
    }
  }

  return Response.json(toSafe(lr, targetEmployee), { status: 201 });
}
