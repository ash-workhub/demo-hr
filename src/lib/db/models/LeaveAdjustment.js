// src/lib/db/models/LeaveAdjustment.js
// Audited balance adjustment ledger entry. V2 Step 3 — additive.
//
// An adjustment is a signed amount (+adds, -subtracts) applied to an employee's
// leave balance for a specific type and year. Examples:
//   +5 casual  "Carry-over credit (manual)"
//   -2 sick    "Correction for over-approval in March"
//   +10 earned "Annual grant"
//
// Adjustments are APPEND-ONLY — never overwritten or deleted. Multiple
// adjustments per employee/type/year sum into the balance.
//
// NO automatic accrual or carry-forward is performed by this model. All
// adjustments are explicit, manual, and audited.
import mongoose from 'mongoose';

const adjustmentSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    leaveTypeCode: { type: String, required: true, trim: true, lowercase: true, index: true },
    year: { type: Number, required: true, index: true },
    // Signed amount: positive = adds to balance, negative = subtracts.
    amount: { type: Number, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    // Audit: who made the adjustment.
    actor: { type: String, required: true }, // user id
    actorName: { type: String, default: '' },
    actorRole: { type: String, enum: ['hr', 'admin'], required: true },
    actionAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

adjustmentSchema.index({ employeeId: 1, year: 1, leaveTypeCode: 1 });

export default mongoose.models.LeaveAdjustment || mongoose.model('LeaveAdjustment', adjustmentSchema);
