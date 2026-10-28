// src/lib/db/models/Attendance.js
import mongoose from 'mongoose';

const STATUS = ['present', 'late', 'absent', 'leave', 'half-day'];

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    // Calendar date in Asia/Dhaka, stored as YYYY-MM-DD string for uniqueness.
    date: { type: String, required: true },
    checkInTime: { type: Date, default: null },
    checkOutTime: { type: Date, default: null },
    status: { type: String, enum: STATUS, default: 'absent' },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

// One record per employee per day.
attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

export default mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
export { STATUS as ATTENDANCE_STATUS };
