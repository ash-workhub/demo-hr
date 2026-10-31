// src/app/api/attendance/reviews/[id]/route.js
// PATCH /api/attendance/reviews/:id  — set review verdict (hr/admin only)
//
// The review verdict updates ONLY review metadata — it NEVER mutates the punch
// time/evidence. If action is needed, a separate AttendanceCorrection is created.
import { connectDB, AttendanceReview } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { reviewActionSchema, validate } from '@/lib/zod-schemas.js';

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

export async function PATCH(request, { params }) {
  let user;
  try {
    user = await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json({ error: status === 403 ? 'Forbidden — managers cannot review records' : 'Unauthorized' }, { status });
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  const { data, error } = validate(reviewActionSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  const { id } = await params;
  await connectDB();
  const review = await AttendanceReview.findById(id);
  if (!review) return Response.json({ error: 'Not found' }, { status: 404 });

  if (review.reviewVerdict !== 'pending') {
    return Response.json({ error: { _: `Review already verdicted as '${review.reviewVerdict}'` } }, { status: 422 });
  }

  // Update ONLY review metadata — never touch the attendance punch.
  review.reviewVerdict = data.verdict;
  review.reviewedBy = user.id;
  review.reviewedAt = new Date();
  review.reviewNote = data.note || '';
  await review.save();

  return Response.json(toSafe(review));
}
