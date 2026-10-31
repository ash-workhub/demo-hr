// src/lib/db/models/Branch.js
// Company-scoped branch/location reference record. Managed by HR/Admin.
// V2 Step 1 — additive; no V1 data affected.
import mongoose from 'mongoose';

const branchSchema = new mongoose.Schema(
  {
    company: { type: String, required: true, default: 'FegHR Demo', index: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  },
  { timestamps: true }
);

// Unique within company: code and name.
branchSchema.index({ company: 1, code: 1 }, { unique: true });
branchSchema.index({ company: 1, name: 1 }, { unique: true });

export default mongoose.models.Branch || mongoose.model('Branch', branchSchema);
