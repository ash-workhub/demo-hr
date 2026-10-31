// src/app/api/attendance/corrections/[id]/route.js
// PATCH /api/attendance/corrections/:id  — confirm, reject, or apply a correction (hr/admin only)
//
// Workflow:
//   pending → confirmed (action: 'confirm')  — second step, records confirmer
//   pending/confirmed → rejected (action: 'reject') — terminal
//   confirmed → applied (action: 'apply') — writes to Attendance.correctedX, terminal
//
// Applying a correction NEVER mutates the raw punch (Attendance.checkInTime/checkOutTime/rawPunches).
// It only sets the correctedX override fields. The effective value = correctedX ?? rawX.
import { connectDB, Attendance, AttendanceCorrection } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { correctionActionSchema, validate } from '@/lib/zod-schemas.js';
import { applyCorrection } from '@/lib/attendance-engine.js';

function toSafe(c) {
  return {
    id: c._id.toString(),
    attendanceId: c.attendanceId ? c.attendanceId.toString() : null,
    employeeId: c.employeeId ? c.employeeId.toString() : null,
    date: c.date,
    field: c.field,
    originalValue: c.originalValue,
    correctedValue: c.correctedValue,
    reason: c.reason,
    status: c.status,
    createdBy: c.createdBy,
    createdByName: c.createdByName,
    createdAt: c.createdAt,
    confirmedBy: c.confirmedBy,
    confirmedAt: c.confirmedAt,
    appliedBy: c.appliedBy,
    appliedAt: c.appliedAt,
    rejectedBy: c.rejectedBy,
    rejectedAt: c.rejectedAt,
    rejectReason: c.rejectReason,
  };
}

export async function PATCH(request, { params }) {
  let user;
  try {
    user = await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json({ error: status === 403 ? 'Forbidden — managers cannot action corrections' : 'Unauthorized' }, { status });
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  const { data, error } = validate(correctionActionSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  const { id } = await params;
  await connectDB();
  const correction = await AttendanceCorrection.findById(id);
  if (!correction) return Response.json({ error: 'Not found' }, { status: 404 });

  if (data.action === 'confirm') {
    if (correction.status !== 'pending') {
      return Response.json({ error: { _: `Cannot confirm a correction in '${correction.status}' state` } }, { status: 422 });
    }
    correction.status = 'confirmed';
    correction.confirmedBy = user.id;
    correction.confirmedAt = new Date();
  } else if (data.action === 'reject') {
    if (correction.status === 'applied' || correction.status === 'rejected') {
      return Response.json({ error: { _: `Cannot reject a correction in '${correction.status}' state` } }, { status: 422 });
    }
    correction.status = 'rejected';
    correction.rejectedBy = user.id;
    correction.rejectedAt = new Date();
    correction.rejectReason = data.rejectReason || '';
  } else if (data.action === 'apply') {
    if (correction.status !== 'confirmed') {
      return Response.json({ error: { _: `Cannot apply a correction in '${correction.status}' state — must be 'confirmed' first` } }, { status: 422 });
    }
    // Apply the correction to the Attendance record — set correctedX override.
    // This NEVER mutates raw punches.
    const attendance = await Attendance.findById(correction.attendanceId);
    if (!attendance) {
      return Response.json({ error: { _: 'Attendance record no longer exists' } }, { status: 422 });
    }
    const result = applyCorrection(attendance, correction);
    attendance.correctedCheckInTime = result.correctedCheckInTime;
    attendance.correctedCheckOutTime = result.correctedCheckOutTime;
    attendance.correctedStatus = result.correctedStatus;
    await attendance.save();

    correction.status = 'applied';
    correction.appliedBy = user.id;
    correction.appliedAt = new Date();
  }

  await correction.save();
  return Response.json(toSafe(correction));
}
