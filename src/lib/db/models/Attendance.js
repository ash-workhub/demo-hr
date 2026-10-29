// src/lib/db/models/Attendance.js
import mongoose from 'mongoose';

const STATUS = ['present', 'late', 'absent', 'leave', 'half-day', 'holiday', 'week-off', 'pending'];

const rawPunchSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['in', 'out'], required: true },
    time: { type: Date, required: true },
    source: { type: String, enum: ['self', 'system', 'correction'], default: 'self' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const policySnapshotSchema = new mongoose.Schema(
  {
    workdays: [Number],
    startTime: String,
    endTime: String,
    graceMinutes: Number,
    lateAfterMinutes: Number,
    halfDayMinMinutes: { type: Number, default: null },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    // Calendar date in Asia/Dhaka, stored as YYYY-MM-DD string for uniqueness.
    date: { type: String, required: true },
    // V1 fields (kept for backward compat — mirror the raw punch times):
    checkInTime: { type: Date, default: null },
    checkOutTime: { type: Date, default: null },
    status: { type: String, enum: STATUS, default: 'absent' },
    notes: { type: String, default: '' },

    // V2 Step 2 — immutable raw punch evidence. Once appended, never mutated.
    rawPunches: { type: [rawPunchSchema], default: [] },
    // V2 Step 2 — frozen snapshot of the policy used to compute status that day.
    policySnapshot: { type: policySnapshotSchema, default: null },
    // V2 Step 2 — correction overrides (null = use raw; set = corrected value).
    // The effective value = correctedX ?? rawX. Raw is never mutated by corrections.
    correctedCheckInTime: { type: Date, default: null },
    correctedCheckOutTime: { type: Date, default: null },
    correctedStatus: { type: String, enum: STATUS, default: null },
  },
  { timestamps: true }
);

// One record per employee per day.
attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

// Virtual: effective values (corrected ?? raw). Used by all V2 reads.
attendanceSchema.virtual('effectiveCheckInTime').get(function () {
  return this.correctedCheckInTime ?? this.checkInTime;
});
attendanceSchema.virtual('effectiveCheckOutTime').get(function () {
  return this.correctedCheckOutTime ?? this.checkOutTime;
});
attendanceSchema.virtual('effectiveStatus').get(function () {
  return this.correctedStatus ?? this.status;
});

export default mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
export { STATUS as ATTENDANCE_STATUS };
