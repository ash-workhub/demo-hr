// src/lib/notifications.js
// Dedup-safe notification creation. Checks for an existing notification with the
// same (userId, type, relatedId) before inserting; if one exists, returns it
// instead of creating a duplicate. The DB also has a unique partial index as a
// backstop (in case of race conditions).
import { Notification } from './db/index.js';

/**
 * Creates a notification, deduplicating on (userId, type, relatedId).
 * If relatedId is null, dedup is skipped (system-wide notifications).
 *
 * @param {object} opts - { userId, type, title, message, link, relatedId }
 * @returns {Promise<object|null>} the existing or newly created notification, or null on failure
 */
export async function createNotification(opts) {
  try {
    // Pre-check for dedup (only when relatedId is set).
    if (opts.relatedId) {
      const existing = await Notification.findOne({
        userId: opts.userId,
        type: opts.type,
        relatedId: opts.relatedId,
      }).lean();
      if (existing) return existing;
    }
    return await Notification.create({
      userId: opts.userId,
      type: opts.type,
      title: opts.title,
      message: opts.message,
      link: opts.link || '',
      relatedId: opts.relatedId || null,
      read: false,
    });
  } catch (e) {
    // E11000 = duplicate key (race condition hit the unique index) — safe to ignore.
    if (e.code === 11000) {
      return await Notification.findOne({
        userId: opts.userId,
        type: opts.type,
        relatedId: opts.relatedId,
      }).lean();
    }
    // Best-effort: don't let notification failures break the calling flow.
    console.error('Failed to create notification:', e.message);
    return null;
  }
}
