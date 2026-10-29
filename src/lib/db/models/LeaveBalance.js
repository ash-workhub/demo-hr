// src/lib/db/models/LeaveBalance.js
import mongoose from 'mongoose';

const leaveBalanceSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    year: { type: Number, required: true },
    // V1 buckets (kept for backward compat):
    casual: { total: { type: Number, default: 10 }, used: { type: Number, default: 0 } },
    sick: { total: { type: Number, default: 12 }, used: { type: Number, default: 0 } },
    earned: { total: { type: Number, default: 15 }, used: { type: Number, default: 0 } },
    unpaid: { used: { type: Number, default: 0 } },
    // V2 Step 3 — cached sum of approved adjustments per type (for fast reconciliation).
    // The authoritative source is the LeaveAdjustment collection; this is a denormalized cache.
    adjustmentsTotal: {
      casual: { type: Number, default: 0 },
      sick: { type: Number, default: 0 },
      earned: { type: Number, default: 0 },
      unpaid: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

leaveBalanceSchema.index({ employeeId: 1, year: 1 }, { unique: true });

export default mongoose.models.LeaveBalance || mongoose.model('LeaveBalance', leaveBalanceSchema);
