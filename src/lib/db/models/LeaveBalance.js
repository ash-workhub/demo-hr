// src/lib/db/models/LeaveBalance.js
import mongoose from 'mongoose';

const leaveBalanceSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    year: { type: Number, required: true },
    casual: { total: { type: Number, default: 10 }, used: { type: Number, default: 0 } },
    sick: { total: { type: Number, default: 12 }, used: { type: Number, default: 0 } },
    earned: { total: { type: Number, default: 15 }, used: { type: Number, default: 0 } },
    unpaid: { used: { type: Number, default: 0 } },
  },
  { timestamps: true }
);

leaveBalanceSchema.index({ employeeId: 1, year: 1 }, { unique: true });

export default mongoose.models.LeaveBalance || mongoose.model('LeaveBalance', leaveBalanceSchema);
