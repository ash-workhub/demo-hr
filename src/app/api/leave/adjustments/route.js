// src/app/api/leave/adjustments/route.js
// GET  /api/leave/adjustments   — list (hr/admin: all; manager: own reports; employee: own)
// POST /api/leave/adjustments   — create adjustment (hr/admin only, audited, append-only)
import { connectDB, Employee, LeaveAdjustment, LeaveBalance } from '@/lib/db/index.js';
import { requireUser, requireRole, getSessionEmployee } from '@/lib/auth-helpers.js';
import { createAdjustmentSchema, validate } from '@/lib/zod-schemas.js';
import { applyAdjustment } from '@/lib/leave-balance-engine.js';

function toSafe(a) {
  return {
    id: a._id.toString(),
    employeeId: a.employeeId ? a.employeeId.toString() : null,
    leaveTypeCode: a.leaveTypeCode,
    year: a.year,
    amount: a.amount,
    reason: a.reason,
    actor: a.actor,
    actorName: a.actorName,
    actorRole: a.actorRole,
    actionAt: a.actionAt,
    createdAt: a.createdAt,
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
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get('employeeId');
  const year = searchParams.get('year');

  let filter = {};
  if (year) filter.year = parseInt(year, 10);

  if (employeeId) {
    filter.employeeId = employeeId;
    // Permission: employee sees own; manager sees reports; hr/admin see any.
    if (user.role === 'employee') {
      const me = await getSessionEmployee();
      if (!me || me._id.toString() !== employeeId) {
        return Response.json({ error: 'Forbidden — can only view your own adjustments' }, { status: 403 });
      }
    } else if (user.role === 'manager') {
      const me = await getSessionEmployee();
      const target = await Employee.findById(employeeId).lean();
      if (!target || !target.managerId || target.managerId.toString() !== me._id.toString()) {
        return Response.json({ error: 'Forbidden — can only view your direct reports\' adjustments' }, { status: 403 });
      }
    }
  } else if (user.role === 'employee' || user.role === 'manager') {
    const me = await getSessionEmployee();
    if (!me) return Response.json({ error: 'No linked employee record' }, { status: 403 });
    if (user.role === 'manager') {
      const reportIds = (await Employee.find({ managerId: me._id, status: 'active' }).select('_id').lean()).map((e) => e._id);
      filter.employeeId = { $in: [me._id, ...reportIds] };
    } else {
      filter.employeeId = me._id;
    }
  }

  const items = await LeaveAdjustment.find(filter).sort({ actionAt: -1 }).limit(100).lean();

  // Batch-load employee names.
  const empIds = [...new Set(items.map((a) => a.employeeId?.toString()).filter(Boolean))];
  const employees = await Employee.find({ _id: { $in: empIds } }).lean();
  const empMap = new Map(employees.map((e) => [e._id.toString(), e]));

  return Response.json({
    items: items.map((a) => {
      const safe = toSafe(a);
      const emp = empMap.get(a.employeeId?.toString());
      safe.employeeName = emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown';
      safe.employeeCode = emp?.employeeId || '';
      return safe;
    }),
  });
}

export async function POST(request) {
  let user;
  try {
    user = await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json({ error: status === 403 ? 'Forbidden — only HR/Admin can create adjustments' : 'Unauthorized' }, { status });
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  const { data, error } = validate(createAdjustmentSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  await connectDB();

  const emp = await Employee.findById(data.employeeId);
  if (!emp) return Response.json({ error: { employeeId: 'Employee not found' } }, { status: 422 });

  // Create the adjustment — append-only, never overwrites an existing one.
  const adjustment = await LeaveAdjustment.create({
    employeeId: emp._id,
    leaveTypeCode: data.leaveTypeCode,
    year: data.year,
    amount: data.amount,
    reason: data.reason,
    actor: user.id,
    actorName: user.name || '',
    actorRole: user.role,
    actionAt: new Date(),
  });

  // Update the cached adjustmentsTotal on the LeaveBalance doc (if it exists).
  // If the balance doesn't exist, we skip the cache update — it will be
  // recomputed on next statement request via sumAdjustments().
  const balance = await LeaveBalance.findOne({ employeeId: emp._id, year: data.year });
  if (balance) {
    const currentTotal = balance.adjustmentsTotal?.[data.leaveTypeCode] || 0;
    balance.adjustmentsTotal = balance.adjustmentsTotal || {};
    balance.adjustmentsTotal[data.leaveTypeCode] = applyAdjustment(currentTotal, data.amount);
    // Mark nested object as modified for Mongoose.
    balance.markModified('adjustmentsTotal');
    await balance.save();
  }

  return Response.json(toSafe(adjustment), { status: 201 });
}
