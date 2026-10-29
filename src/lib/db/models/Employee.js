// src/lib/db/models/Employee.js
import mongoose from 'mongoose';

const ROLES = ['employee', 'manager', 'hr', 'admin'];

const employeeSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, index: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    // V1 fields (kept for backward compat — denormalized current value):
    department: { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true },
    // V2 Step 1 — optional references to canonical reference records.
    // When set, these coexist with the string fields above (which mirror the
    // reference record's name for V1 display/compat).
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    designationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation', default: null },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    role: { type: String, enum: ROLES, required: true, default: 'employee', index: true },
    joinDate: { type: Date, required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    avatarColor: { type: String, default: '#6b7280' },
  },
  { timestamps: true }
);

employeeSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

employeeSchema.virtual('reports', {
  ref: 'Employee',
  localField: '_id',
  foreignField: 'managerId',
});

// For auth linkage: a User (Better Auth) doc with matching email is the account.
employeeSchema.methods.toSafe = function () {
  return {
    id: this._id.toString(),
    employeeId: this.employeeId,
    firstName: this.firstName,
    lastName: this.lastName,
    fullName: this.fullName,
    email: this.email,
    phone: this.phone,
    department: this.department,
    designation: this.designation,
    // V2 Step 1 — optional reference IDs (null if not yet linked).
    branchId: this.branchId ? this.branchId.toString() : null,
    departmentId: this.departmentId ? this.departmentId.toString() : null,
    designationId: this.designationId ? this.designationId.toString() : null,
    managerId: this.managerId ? this.managerId.toString() : null,
    role: this.role,
    joinDate: this.joinDate,
    status: this.status,
    avatarColor: this.avatarColor,
  };
};

export default mongoose.models.Employee || mongoose.model('Employee', employeeSchema);
export { ROLES as EMPLOYEE_ROLES };
