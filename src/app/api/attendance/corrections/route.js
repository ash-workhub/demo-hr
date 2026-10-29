// src/app/api/attendance/corrections/route.js
// GET  /api/attendance/corrections   — list (hr/admin only)
// POST /api/attendance/corrections   — create a pending correction (hr/admin only)
//
// A correction is a SEPARATE override — it never mutates the raw punch evidence.
// Workflow: pending → confirmed → applied (or rejected).
import { connectDB, Attendance, AttendanceCorrection, Employee } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { createCorrectionSchema, validate } from '@/lib/zod-schemas.js';

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

export async function GET(request) {
  let user;
  try {
    user = await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json({ error: status === 403 ? 'Forbidden — managers cannot access corrections' : 'Unauthorized' }, { status });
  }

  await connectDB();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'pending';
  const filter = {};
  if (status !== 'all') filter.status = status;

  const items = await AttendanceCorrection.find(filter).sort({ createdAt: -1 }).limit(100).lean();

  // Batch-load employee names for display.
  const empIds = [...new Set(items.map((c) => c.employeeId?.toString()).filter(Boolean))];
  const employees = await Employee.find({ _id: { $in: empIds } }).lean();
  const empMap = new Map(employees.map((e) => [e._id.toString(), e]));

  return Response.json({
    items: items.map((c) => {
      const safe = toSafe(c);
      const emp = empMap.get(c.employeeId?.toString());
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
    return Response.json({ error: status === 403 ? 'Forbidden — managers cannot create corrections' : 'Unauthorized' }, { status });
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  const { data, error } = validate(createCorrectionSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  await connectDB();

  const attendance = await Attendance.findById(data.attendanceId);
  if (!attendance) return Response.json({ error: { attendanceId: 'Attendance record not found' } }, { status: 422 });

  // Capture the original value (raw evidence — for audit).
  let originalValue = '';
  if (data.field === 'checkInTime') originalValue = attendance.checkInTime?.toISOString() || 'null';
  else if (data.field === 'checkOutTime') originalValue = attendance.checkOutTime?.toISOString() || 'null';
  else if (data.field === 'status') originalValue = attendance.status || 'absent';

  // Validate correctedValue format.
  if (data.field === 'status') {
    const validStatuses = ['present', 'late', 'absent', 'leave', 'half-day', 'holiday', 'week-off', 'pending'];
    if (!validStatuses.includes(data.correctedValue)) {
      return Response.json({ error: { correctedValue: `Invalid status. Must be one of: ${validStatuses.join(', ')}` } }, { status: 422 });
    }
  } else {
    // checkInTime / checkOutTime — must be a valid date.
    if (isNaN(Date.parse(data.correctedValue))) {
      return Response.json({ error: { correctedValue: 'Invalid date/time' } }, { status: 422 });
    }
  }

  const correction = await AttendanceCorrection.create({
    attendanceId: attendance._id,
    employeeId: attendance.employeeId,
    date: attendance.date,
    field: data.field,
    originalValue,
    correctedValue: data.correctedValue,
    reason: data.reason,
    status: 'pending',
    createdBy: user.id,
    createdByName: user.name || '',
    createdAt: new Date(),
  });

  return Response.json(toSafe(correction), { status: 201 });
}
