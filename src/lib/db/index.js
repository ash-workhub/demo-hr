// src/lib/db/index.js — barrel export for all data models + connection.
export { default as connectDB } from './connect.js';
export { default as Employee, EMPLOYEE_ROLES } from './models/Employee.js';
export { default as Attendance, ATTENDANCE_STATUS } from './models/Attendance.js';
export { default as LeaveRequest, LEAVE_STATUS, LEAVE_TYPES } from './models/LeaveRequest.js';
export { default as LeaveBalance } from './models/LeaveBalance.js';
export { default as Notification, NOTIFICATION_TYPES } from './models/Notification.js';
export { default as User } from './models/User.js';
