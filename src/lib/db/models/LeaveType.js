// src/lib/db/models/LeaveType.js
// Company-scoped, configurable leave type. V2 Step 3 — additive.
// Replaces the hardcoded LEAVE_TYPES enum. V1 types (casual/sick/earned/unpaid)
// become seed records; unpaid gets isUnlimited=true.
import mongoose from 'mongoose';

const leaveTypeSchema = new mongoose.Schema(
  {
    company: { type: String, required: true, default: 'FegHR Demo', index: true },
    code: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    // If true, this leave type has no quota cap (e.g., unpaid leave).
    // Represented explicitly as a boolean, NOT as numeric zero.
    isUnlimited: { type: Boolean, default: false },
    // Default quota (days) for new employees. Ignored if isUnlimited=true.
    defaultQuota: { type: Number, default: 0, min: 0 },
    // Optional: whether this type requires documentation (e.g., sick > 3 days).
    requiresDocumentation: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  },
  { timestamps: true }
);

// Unique code within company.
leaveTypeSchema.index({ company: 1, code: 1 }, { unique: true });

export default mongoose.models.LeaveType || mongoose.model('LeaveType', leaveTypeSchema);
