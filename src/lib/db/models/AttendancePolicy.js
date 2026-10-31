// src/lib/db/models/AttendancePolicy.js
// Company-scoped, effective-dated attendance policy.
// V2 Step 2 — additive. Defines workdays, start/end time, grace period, late threshold.
// One active policy per company at a time (endDate=null).
import mongoose from 'mongoose';

const policySchema = new mongoose.Schema(
  {
    company: { type: String, required: true, default: 'FegHR Demo', index: true },
    name: { type: String, required: true, trim: true },
    effectiveDate: { type: Date, required: true, index: true },
    endDate: { type: Date, default: null, index: true },
    // Workdays: array of weekday numbers (0=Sun, 1=Mon, ..., 6=Sat). Default Mon-Fri.
    workdays: { type: [Number], enum: [0, 1, 2, 3, 4, 5, 6], default: [1, 2, 3, 4, 5] },
    // Local time in "HH:mm" 24h format (Asia/Dhaka).
    startTime: { type: String, required: true, default: '09:00', match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
    endTime: { type: String, required: true, default: '17:00', match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
    // Grace period in minutes: check-in within grace is "present", after is "late".
    graceMinutes: { type: Number, default: 15, min: 0, max: 120 },
    // Minimum worked minutes for half-day. If null, half-day not auto-computed.
    halfDayMinMinutes: { type: Number, default: null, min: 0, max: 600 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  },
  { timestamps: true }
);

// Only one active (endDate=null) policy per company at a time.
policySchema.index(
  { company: 1, endDate: 1 },
  { unique: true, partialFilterExpression: { endDate: null } }
);

export default mongoose.models.AttendancePolicy || mongoose.model('AttendancePolicy', policySchema);
