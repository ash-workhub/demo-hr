// src/lib/db/models/Notification.js
import mongoose from 'mongoose';

const NOTIFICATION_TYPES = [
  'leave_submitted',
  'leave_manager_approved',
  'leave_hr_approved',
  'leave_rejected',
  'leave_cancelled',
  'attendance_reminder',
  'system',
];

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    link: { type: String, default: '' },
    relatedId: { type: mongoose.Schema.Types.ObjectId, default: null },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
// Dedup index: prevent duplicate notifications for the same user + type + related entity.
// `partialFilterExpression` makes the index apply only when relatedId is set, so
// system-wide notifications (no relatedId) aren't constrained.
notificationSchema.index(
  { userId: 1, type: 1, relatedId: 1 },
  { unique: true, partialFilterExpression: { relatedId: { $type: 'objectId' } } }
);

export default mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
export { NOTIFICATION_TYPES };
