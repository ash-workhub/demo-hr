// src/lib/db/models/Department.js
// Company-scoped department reference record. Managed by HR/Admin.
// V2 Step 1 — additive. Employee.department (string) is kept for V1 compat;
// this record is the canonical reference, linked via Employee.departmentId.
import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema(
  {
    company: { type: String, required: true, default: 'FegHR Demo', index: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    // Optional: which branch this department belongs to (for reporting).
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  },
  { timestamps: true }
);

// Unique within company: code and name.
departmentSchema.index({ company: 1, code: 1 }, { unique: true });
departmentSchema.index({ company: 1, name: 1 }, { unique: true });

export default mongoose.models.Department || mongoose.model('Department', departmentSchema);
