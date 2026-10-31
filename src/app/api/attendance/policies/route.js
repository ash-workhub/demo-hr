// src/app/api/attendance/policies/route.js
// GET  /api/attendance/policies   — list (all signed-in users; they need to see workday rules)
// POST /api/attendance/policies   — create (hr/admin only)
import { connectDB, AttendancePolicy } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { createPolicySchema, validate } from '@/lib/zod-schemas.js';
import { timeToMinutes } from '@/lib/attendance-engine.js';

const COMPANY = 'FegHR Demo';

function toSafe(p) {
  return {
    id: p._id.toString(),
    company: p.company,
    name: p.name,
    effectiveDate: p.effectiveDate,
    endDate: p.endDate,
    workdays: p.workdays,
    startTime: p.startTime,
    endTime: p.endTime,
    graceMinutes: p.graceMinutes,
    lateAfterMinutes: timeToMinutes(p.startTime) + p.graceMinutes,
    halfDayMinMinutes: p.halfDayMinMinutes,
    status: p.status,
    isCurrent: p.endDate === null && p.status === 'active',
  };
}

export async function GET(request) {
  try {
    await requireRole('employee', 'manager', 'hr', 'admin');
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await connectDB();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'all';
  const filter = { company: COMPANY };
  if (status !== 'all') filter.status = status;
  const items = await AttendancePolicy.find(filter).sort({ effectiveDate: -1 }).lean();
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

  const { data, error } = validate(createPolicySchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  await connectDB();

  // If this new policy is effective today or in the past, close any currently-active policy.
  const effDate = new Date(data.effectiveDate);
  effDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (effDate <= today) {
    const current = await AttendancePolicy.findOne({ company: COMPANY, endDate: null, status: 'active' });
    if (current) {
      const prevEnd = new Date(effDate);
      prevEnd.setDate(prevEnd.getDate() - 1);
      await AttendancePolicy.updateOne({ _id: current._id }, { $set: { endDate: prevEnd } });
    }
  }

  try {
    const created = await AttendancePolicy.create({ ...data, company: COMPANY, effectiveDate: effDate });
    return Response.json(toSafe(created), { status: 201 });
  } catch (e) {
    if (e.code === 11000) {
      return Response.json({ error: { _: 'Another active policy already exists. Close it first.' } }, { status: 409 });
    }
    return Response.json({ error: { _: 'Failed to create policy: ' + e.message } }, { status: 500 });
  }
}
