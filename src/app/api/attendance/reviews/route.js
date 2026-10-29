// src/app/api/attendance/reviews/route.js
// GET  /api/attendance/reviews   — list flagged records (hr/admin only)
// POST /api/attendance/reviews   — flag a record (hr/admin only; system flags created internally)
//
// A review is METADATA about a flagged record. The review verdict updates ONLY
// review metadata — it NEVER mutates the punch time/evidence. If action is needed,
// a separate AttendanceCorrection is created.
import { connectDB, Attendance, AttendanceReview, Employee } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { createReviewSchema, validate } from '@/lib/zod-schemas.js';

function toSafe(r) {
  return {
    id: r._id.toString(),
    attendanceId: r.attendanceId ? r.attendanceId.toString() : null,
    employeeId: r.employeeId ? r.employeeId.toString() : null,
    date: r.date,
    flagReason: r.flagReason,
    flagSeverity: r.flagSeverity,
    source: r.source,
    flaggedBy: r.flaggedBy,
    flaggedByName: r.flaggedByName,
    flaggedAt: r.flaggedAt,
    reviewVerdict: r.reviewVerdict,
    reviewedBy: r.reviewedBy,
    reviewedAt: r.reviewedAt,
    reviewNote: r.reviewNote,
  };
}

export async function GET(request) {
  let user;
  try {
    user = await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json({ error: status === 403 ? 'Forbidden — review queue is for HR/Admin only' : 'Unauthorized' }, { status });
  }

  await connectDB();
  const { searchParams } = new URL(request.url);
  const verdict = searchParams.get('verdict') || 'pending';
  const filter = {};
  if (verdict !== 'all') filter.reviewVerdict = verdict;

  const items = await AttendanceReview.find(filter).sort({ flaggedAt: -1 }).limit(100).lean();

  // Batch-load employee names.
  const empIds = [...new Set(items.map((r) => r.employeeId?.toString()).filter(Boolean))];
  const employees = await Employee.find({ _id: { $in: empIds } }).lean();
  const empMap = new Map(employees.map((e) => [e._id.toString(), e]));

  // Batch-load attendance records for context.
  const attIds = [...new Set(items.map((r) => r.attendanceId?.toString()).filter(Boolean))];
  const attendances = await Attendance.find({ _id: { $in: attIds } }).lean();
  const attMap = new Map(attendances.map((a) => [a._id.toString(), a]));

  return Response.json({
    items: items.map((r) => {
      const safe = toSafe(r);
      const emp = empMap.get(r.employeeId?.toString());
      safe.employeeName = emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown';
      safe.employeeCode = emp?.employeeId || '';
      const att = attMap.get(r.attendanceId?.toString());
      safe.attendance = att ? {
        checkInTime: att.checkInTime,
        checkOutTime: att.checkOutTime,
        status: att.status,
        effectiveStatus: att.correctedStatus || att.status,
        hasCorrection: !!(att.correctedCheckInTime || att.correctedCheckOutTime || att.correctedStatus),
      } : null;
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
    return Response.json({ error: status === 403 ? 'Forbidden — managers cannot flag records' : 'Unauthorized' }, { status });
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  const { data, error } = validate(createReviewSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  await connectDB();

  const attendance = await Attendance.findById(data.attendanceId);
  if (!attendance) return Response.json({ error: { attendanceId: 'Attendance record not found' } }, { status: 422 });

  // Check for existing pending review on this attendance.
  const existing = await AttendanceReview.findOne({ attendanceId: attendance._id, reviewVerdict: 'pending' }).lean();
  if (existing) {
    return Response.json({ error: { _: 'A pending review already exists for this attendance record' } }, { status: 409 });
  }

  const review = await AttendanceReview.create({
    attendanceId: attendance._id,
    employeeId: attendance.employeeId,
    date: attendance.date,
    flagReason: data.flagReason,
    flagSeverity: data.flagSeverity,
    source: 'user',
    flaggedBy: user.id,
    flaggedByName: user.name || '',
    flaggedAt: new Date(),
    reviewVerdict: 'pending',
  });

  return Response.json(toSafe(review), { status: 201 });
}
