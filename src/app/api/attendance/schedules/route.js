// src/app/api/attendance/schedules/route.js
// GET  /api/attendance/schedules   — list (hr/admin: all; manager: own reports; employee: own)
// POST /api/attendance/schedules   — create (hr/admin only, effective-dated)
import { connectDB, Employee, EmployeeSchedule, AttendancePolicy } from '@/lib/db/index.js';
import { requireUser, requireRole, getSessionEmployee } from '@/lib/auth-helpers.js';
import { createScheduleSchema, validate } from '@/lib/zod-schemas.js';
import { validateEffectiveDate, computePrevEndDate } from '@/lib/org-engine.js';

function toSafe(s) {
  return {
    id: s._id.toString(),
    employeeId: s.employeeId ? s.employeeId.toString() : null,
    effectiveDate: s.effectiveDate,
    endDate: s.endDate,
    policyId: s.policyId ? s.policyId.toString() : null,
    customStartTime: s.customStartTime,
    customEndTime: s.customEndTime,
    customWorkdays: s.customWorkdays || [],
    reason: s.reason || '',
    isCurrent: s.endDate === null,
    createdBy: s.createdBy || '',
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
  let filter = {};

  if (user.role === 'employee' || user.role === 'manager') {
    const me = await getSessionEmployee();
    if (!me) return Response.json({ error: 'No linked employee record' }, { status: 403 });
    if (user.role === 'manager') {
      const reportIds = (await Employee.find({ managerId: me._id, status: 'active' }).select('_id').lean()).map((e) => e._id);
      filter.employeeId = { $in: [me._id, ...reportIds] };
    } else {
      filter.employeeId = me._id;
    }
  }

  const items = await EmployeeSchedule.find(filter).sort({ effectiveDate: -1 }).limit(100).lean();
  return Response.json({ items: items.map(toSafe) });
}

export async function POST(request) {
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

  const { data, error } = validate(createScheduleSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  await connectDB();

  const emp = await Employee.findById(data.employeeId);
  if (!emp) return Response.json({ error: { employeeId: 'Employee not found' } }, { status: 422 });

  // Validate policyId if provided.
  if (data.policyId) {
    const policy = await AttendancePolicy.findById(data.policyId).lean();
    if (!policy) return Response.json({ error: { policyId: 'Policy not found' } }, { status: 422 });
    if (policy.status !== 'active') {
      return Response.json({ error: { policyId: 'Policy is inactive' } }, { status: 422 });
    }
  }

  // Validate effectiveDate (not before joinDate, not before prev effectiveDate).
  const currentSchedule = await EmployeeSchedule.findOne({ employeeId: emp._id, endDate: null }).lean();
  const prevEff = currentSchedule ? currentSchedule.effectiveDate : null;
  const dateCheck = validateEffectiveDate(data.effectiveDate, emp.joinDate, prevEff);
  if (!dateCheck.ok) {
    return Response.json({ error: { effectiveDate: dateCheck.reason } }, { status: 422 });
  }

  // Close the current schedule.
  if (currentSchedule) {
    const prevEnd = computePrevEndDate(data.effectiveDate);
    if (prevEnd < new Date(currentSchedule.effectiveDate)) {
      return Response.json({ error: { effectiveDate: 'New effective date is too close to the previous schedule' } }, { status: 422 });
    }
    await EmployeeSchedule.updateOne({ _id: currentSchedule._id }, { $set: { endDate: prevEnd } });
  }

  const created = await EmployeeSchedule.create({
    employeeId: emp._id,
    effectiveDate: new Date(data.effectiveDate),
    endDate: null,
    policyId: data.policyId || null,
    customStartTime: data.customStartTime || null,
    customEndTime: data.customEndTime || null,
    customWorkdays: data.customWorkdays || [],
    reason: data.reason || '',
    createdBy: user.id,
  });

  return Response.json(toSafe(created), { status: 201 });
}
