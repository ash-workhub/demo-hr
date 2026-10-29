// src/lib/db/models/Designation.js
// Company-scoped designation/job-title reference record. Managed by HR/Admin.
// V2 Step 1 — additive. Employee.designation (string) is kept for V1 compat;
// this record is the canonical reference, linked via Employee.designationId.
import mongoose from 'mongoose';

const designationSchema = new mongoose.Schema(
  {
    company: { type: String, required: true, default: 'FegHR Demo', index: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    // Optional: which department this designation typically belongs to.
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  },
  { timestamps: true }
);

// Unique within company: code and name.
designationSchema.index({ company: 1, code: 1 }, { unique: true });
designationSchema.index({ company: 1, name: 1 }, { unique: true });

export default mongoose.models.Designation || mongoose.model('Designation', designationSchema);
