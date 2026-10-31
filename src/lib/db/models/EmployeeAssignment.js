// src/lib/db/models/EmployeeAssignment.js
// Effective-dated employee assignment/movement history.
// Each record captures a snapshot of the employee's branch/department/designation/manager
// as of `effectiveDate`. The current assignment has `endDate: null`.
// V2 Step 1 — additive; never overwrites or deletes prior assignments.
import mongoose from 'mongoose';

const assignmentSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    designationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation', default: null },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    // Denormalized snapshot of the reference names at the time of assignment,
    // so history remains readable even if a reference record is later deactivated.
    branchName: { type: String, default: '' },
    departmentName: { type: String, default: '' },
    designationName: { type: String, default: '' },
    managerName: { type: String, default: '' },
    effectiveDate: { type: Date, required: true, index: true },
    endDate: { type: Date, default: null, index: true },
    reason: { type: String, trim: true, default: '' },
    createdBy: { type: String, default: '' }, // user id of the HR/Admin who created it
  },
  { timestamps: true }
);

assignmentSchema.index({ employeeId: 1, effectiveDate: 1 });
// Only one current (endDate=null) assignment per employee.
assignmentSchema.index(
  { employeeId: 1, endDate: 1 },
  { unique: true, partialFilterExpression: { endDate: null } }
);

export default mongoose.models.EmployeeAssignment || mongoose.model('EmployeeAssignment', assignmentSchema);
