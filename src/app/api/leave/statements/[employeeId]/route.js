// src/app/api/leave/statements/[employeeId]/route.js
// GET /api/leave/statements/:employeeId  — reconciled balance statement
//   Returns per leave type: quota, adjustmentsTotal, used, pending, remaining, available
//   Formula: remaining = quota + adjustments - used; available = remaining - pending
//   Unlimited types: remaining = Infinity, available = Infinity
//
// Permission: hr/admin: any; manager: own reports; employee: own only.
import { connectDB, Employee, LeaveBalance, LeaveAdjustment, LeaveRequest, LeaveType } from '@/lib/db/index.js';
import { requireUser, getSessionEmployee } from '@/lib/auth-helpers.js';
import { buildStatement } from '@/lib/leave-balance-engine.js';

const COMPANY = 'FegHR Demo';

export async function GET(request, { params }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { employeeId } = await params;
  await connectDB();

  const target = await Employee.findById(employeeId).lean();
  if (!target) return Response.json({ error: 'Employee not found' }, { status: 404 });

  // Permission check.
  if (user.role === 'employee') {
    const me = await getSessionEmployee();
    if (!me || me._id.toString() !== employeeId) {
      return Response.json({ error: 'Forbidden — can only view your own statement' }, { status: 403 });
    }
  } else if (user.role === 'manager') {
    const me = await getSessionEmployee();
    if (!target.managerId || target.managerId.toString() !== me._id.toString()) {
      return Response.json({ error: 'Forbidden — can only view your direct reports\' statement' }, { status: 403 });
    }
  }

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10);

  // Load all data needed for reconciliation.
  const [balance, leaveTypes, adjustments, pendingLeaves] = await Promise.all([
    LeaveBalance.findOne({ employeeId: target._id, year }).lean(),
    LeaveType.find({ company: COMPANY, status: 'active' }).sort({ code: 1 }).lean(),
    LeaveAdjustment.find({ employeeId: target._id, year }).lean(),
    LeaveRequest.find({
      employeeId: target._id,
      status: { $in: ['pending_manager', 'pending_hr'] },
    }).lean(),
  ]);

  const statement = buildStatement(balance, leaveTypes, adjustments, pendingLeaves, year);

  return Response.json({
    employee: {
      id: target._id.toString(),
      fullName: `${target.firstName} ${target.lastName}`,
      employeeCode: target.employeeId,
    },
    year,
    statement,
    adjustments: adjustments.map((a) => ({
      id: a._id.toString(),
      leaveTypeCode: a.leaveTypeCode,
      amount: a.amount,
      reason: a.reason,
      actorName: a.actorName,
      actorRole: a.actorRole,
      actionAt: a.actionAt,
    })),
  });
}
