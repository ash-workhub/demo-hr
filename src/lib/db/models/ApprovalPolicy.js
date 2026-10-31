// src/lib/db/models/ApprovalPolicy.js
// Company-scoped, effective-dated leave approval policy.
// V2 Step 4 — additive. Defines the sequential approval route:
//   0-5 manager stages (walking up the employee's management chain)
//   + 1 final HR/Admin stage (always present)
//
// One active policy per company at a time (endDate=null).
// V1 default = managerStages: 1, finalApproverRole: 'hr'.
//
// Policy edits affect NEW submissions only. Pending requests keep their
// frozen routeSnapshot — never rewritten.
import mongoose from 'mongoose';

const policySchema = new mongoose.Schema(
  {
    company: { type: String, required: true, default: 'FegHR Demo', index: true },
    name: { type: String, required: true, trim: true },
    effectiveDate: { type: Date, required: true, index: true },
    endDate: { type: Date, default: null, index: true },
    // Number of manager stages (0-5). 0 = skip straight to HR/Admin.
    managerStages: { type: Number, required: true, default: 1, min: 0, max: 5 },
    // Final approver role: 'hr' or 'admin'. Any user with this role can approve
    // at the final stage.
    finalApproverRole: { type: String, enum: ['hr', 'admin'], required: true, default: 'hr' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  },
  { timestamps: true }
);

// Only one active (endDate=null) policy per company at a time.
policySchema.index(
  { company: 1, endDate: 1 },
  { unique: true, partialFilterExpression: { endDate: null } }
);

export default mongoose.models.ApprovalPolicy || mongoose.model('ApprovalPolicy', policySchema);
