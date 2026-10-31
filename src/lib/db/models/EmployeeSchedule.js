// src/lib/db/models/EmployeeSchedule.js
// Effective-dated schedule assignment for an employee.
// V2 Step 2 — additive. Overrides the company policy for a specific employee
// (e.g., different start time, different workdays).
// One current schedule per employee (endDate=null). Falls back to company policy.
import mongoose from 'mongoose';

const scheduleSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    effectiveDate: { type: Date, required: true, index: true },
    endDate: { type: Date, default: null, index: true },
    // Optional: link to a specific policy. If null, uses company active policy.
    policyId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendancePolicy', default: null },
    // Optional overrides (if set, override the policy's values for this employee).
    customStartTime: { type: String, default: null, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
    customEndTime: { type: String, default: null, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
    customWorkdays: { type: [Number], enum: [0, 1, 2, 3, 4, 5, 6], default: [] },
    reason: { type: String, trim: true, default: '' },
    createdBy: { type: String, default: '' },
  },
  { timestamps: true }
);

scheduleSchema.index({ employeeId: 1, effectiveDate: 1 });
// Only one current schedule per employee.
scheduleSchema.index(
  { employeeId: 1, endDate: 1 },
  { unique: true, partialFilterExpression: { endDate: null } }
);

export default mongoose.models.EmployeeSchedule || mongoose.model('EmployeeSchedule', scheduleSchema);
