// src/lib/db/models/AttendanceReview.js
// HR review queue entry for flagged attendance records.
// V2 Step 2 — additive.
//
// A review is metadata about a flagged record (e.g., missing checkout, early
// checkout, suspicious punch). The review verdict updates ONLY review metadata —
// it never mutates the punch time/evidence. If action is needed, a separate
// AttendanceCorrection is created.
import mongoose from 'mongoose';

const REVIEW_VERDICT = ['pending', 'acknowledged', 'dismissed', 'upheld'];
const FLAG_SEVERITY = ['low', 'medium', 'high'];

const reviewSchema = new mongoose.Schema(
  {
    attendanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance', required: true, index: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    flagReason: { type: String, required: true, trim: true, maxlength: 200 },
    flagSeverity: { type: String, enum: FLAG_SEVERITY, default: 'medium', index: true },
    // System-generated flags use source='system'; manual flags use source='user'.
    source: { type: String, enum: ['system', 'user'], default: 'system' },
    flaggedBy: { type: String, default: '' }, // user id (null for system)
    flaggedByName: { type: String, default: '' },
    flaggedAt: { type: Date, default: Date.now },
    // Review verdict (metadata only — never touches punch).
    reviewVerdict: { type: String, enum: REVIEW_VERDICT, default: 'pending', index: true },
    reviewedBy: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' },
  },
  { timestamps: true }
);

// One open review (verdict=pending) per attendance record.
reviewSchema.index(
  { attendanceId: 1, reviewVerdict: 1 },
  { unique: true, partialFilterExpression: { reviewVerdict: 'pending' } }
);

export default mongoose.models.AttendanceReview || mongoose.model('AttendanceReview', reviewSchema);
export { REVIEW_VERDICT, FLAG_SEVERITY };
