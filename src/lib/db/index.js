// src/lib/db/index.js — barrel export for all data models + connection.
export { default as connectDB } from './connect.js';
export { default as Employee, EMPLOYEE_ROLES } from './models/Employee.js';
export { default as Attendance, ATTENDANCE_STATUS } from './models/Attendance.js';
export { default as LeaveRequest, LEAVE_STATUS, LEAVE_TYPES } from './models/LeaveRequest.js';
export { default as LeaveBalance } from './models/LeaveBalance.js';
export { default as Notification, NOTIFICATION_TYPES } from './models/Notification.js';
export { default as User } from './models/User.js';
// V2 Step 1 — org reference records + assignment history
export { default as Branch } from './models/Branch.js';
export { default as Department } from './models/Department.js';
export { default as Designation } from './models/Designation.js';
export { default as EmployeeAssignment } from './models/EmployeeAssignment.js';
// V2 Step 2 — attendance policy config + corrections + reviews
export { default as AttendancePolicy } from './models/AttendancePolicy.js';
export { default as Holiday } from './models/Holiday.js';
export { default as EmployeeSchedule } from './models/EmployeeSchedule.js';
export { default as AttendanceCorrection, CORRECTION_STATUS } from './models/AttendanceCorrection.js';
export { default as AttendanceReview, REVIEW_VERDICT, FLAG_SEVERITY } from './models/AttendanceReview.js';
// V2 Step 3 — leave type config + adjustment ledger
export { default as LeaveType } from './models/LeaveType.js';
export { default as LeaveAdjustment } from './models/LeaveAdjustment.js';
