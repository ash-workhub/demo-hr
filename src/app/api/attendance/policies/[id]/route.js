// src/app/api/attendance/policies/[id]/route.js
// PATCH  /api/attendance/policies/:id  — update (hr/admin only)
// DELETE /api/attendance/policies/:id  — soft-deactivate (hr/admin only)
import { connectDB, AttendancePolicy } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { updatePolicySchema, validate } from '@/lib/zod-schemas.js';
import { timeToMinutes } from '@/lib/attendance-engine.js';

const COMPANY = 'FegHR Demo';

function toSafe(p) {
  return {
    id: p._id.toString(),
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
  };
}

export async function PATCH(request, { params }) {
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

  const { data, error } = validate(updatePolicySchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  const { id } = await params;
  await connectDB();
  const doc = await AttendancePolicy.findById(id);
  if (!doc) return Response.json({ error: 'Not found' }, { status: 404 });

  for (const key of Object.keys(data)) doc[key] = data[key];
  await doc.save();
  return Response.json(toSafe(doc));
}

export async function DELETE(request, { params }) {
  try {
    await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json({ error: status === 403 ? 'Forbidden' : 'Unauthorized' }, { status });
  }

  const { id } = await params;
  await connectDB();
  const doc = await AttendancePolicy.findById(id);
  if (!doc) return Response.json({ error: 'Not found' }, { status: 404 });

  doc.status = 'inactive';
  await doc.save();
  return Response.json({ id: doc._id.toString(), status: 'inactive' });
}
