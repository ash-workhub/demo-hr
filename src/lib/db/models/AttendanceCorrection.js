// src/lib/db/models/AttendanceCorrection.js
// Audited manual daily-log correction. V2 Step 2 — additive.
//
// A correction is a SEPARATE override — it never mutates the raw punch evidence
// (Attendance.rawPunches / checkInTime / checkOutTime). Instead, it stores the
// corrected value and, when applied, sets the Attendance's correctedX fields.
// The effective value seen by the UI = correctedX ?? rawX.
//
// Workflow: pending → confirmed → applied (or rejected at any step).
// Only HR/Admin can create/confirm/apply. Managers cannot.
import mongoose from 'mongoose';

const CORRECTION_STATUS = ['pending', 'confirmed', 'applied', 'rejected'];

const correctionSchema = new mongoose.Schema(
  {
    attendanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance', required: true, index: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    // Which field is being corrected.
    field: { type: String, enum: ['checkInTime', 'checkOutTime', 'status'], required: true },
    // The original value (for audit — what the raw punch says).
    originalValue: { type: String, default: '' },
    // The corrected value the HR wants to apply.
    correctedValue: { type: String, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    // Workflow state.
    status: { type: String, enum: CORRECTION_STATUS, default: 'pending', index: true },
    // Audit: who created the correction.
    createdBy: { type: String, required: true }, // user id
    createdByName: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    // Audit: who confirmed it (second step before applying).
    confirmedBy: { type: String, default: '' },
    confirmedAt: { type: Date, default: null },
    // Audit: who applied it (final step — writes to Attendance.correctedX).
    appliedBy: { type: String, default: '' },
    appliedAt: { type: Date, default: null },
    // Audit: who rejected it.
    rejectedBy: { type: String, default: '' },
    rejectedAt: { type: Date, default: null },
    rejectReason: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.models.AttendanceCorrection || mongoose.model('AttendanceCorrection', correctionSchema);
export { CORRECTION_STATUS };
