// src/lib/db/models/LeaveRequest.js
import mongoose from 'mongoose';

// Approval-chain states. The leave moves: pending_manager -> pending_hr -> approved.
// 'rejected' or 'cancelled' can occur at any active step.
export const LEAVE_STATUS = [
  'pending_manager', // awaiting employee's manager
  'pending_hr',      // manager approved, awaiting HR
  'approved',        // HR approved — final
  'rejected',        // manager OR hr rejected
  'cancelled',       // employee withdrew before final decision
];

export const LEAVE_TYPES = ['casual', 'sick', 'earned', 'unpaid'];

const actionSchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    byRole: { type: String, enum: ['manager', 'hr', 'admin', 'employee'], required: true },
    decision: { type: String, enum: ['approved', 'rejected', 'cancelled', 'submitted'], required: true },
    note: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  {
    action: { type: String, enum: ['submitted', 'manager_approved', 'manager_rejected', 'hr_approved', 'hr_rejected', 'cancelled', 'system'], required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    byRole: { type: String, enum: ['manager', 'hr', 'admin', 'employee'], default: null },
    note: { type: String, default: '' },
    fromStatus: { type: String, default: '' },
    toStatus: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const leaveRequestSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    leaveType: { type: String, enum: LEAVE_TYPES, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    days: { type: Number, required: true, min: 0.5 },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: LEAVE_STATUS, required: true, default: 'pending_manager', index: true },
    currentApproverRole: { type: String, enum: ['manager', 'hr', null], default: 'manager' },
    managerAction: { type: actionSchema, default: null },
    hrAction: { type: actionSchema, default: null },
    history: { type: [historySchema], default: [] },
    // V2 Step 3 — HR apply-on-behalf audit. Null/absent for self-applied leaves.
    // When HR applies on behalf of an employee, appliedBy records the HR actor
    // (separate from employeeId which records the employee). appliedOnBehalf=true.
    appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    appliedByName: { type: String, default: '' },
    appliedOnBehalf: { type: Boolean, default: false },
  },
  { timestamps: true }
);

leaveRequestSchema.index({ employeeId: 1, status: 1 });
leaveRequestSchema.index({ currentApproverRole: 1, status: 1 });

export default mongoose.models.LeaveRequest || mongoose.model('LeaveRequest', leaveRequestSchema);
