// src/lib/notice-engine.js
// V2 Step 5 — pure functions for company notice audience scoping + authorization.
// No DB, no React, no side effects — fully unit-testable with Vitest.

/**
 * Checks whether a user with the given role is in the notice's audience.
 * Only published notices are visible to non-HR/Admin users.
 *
 * @param {object} notice - { audienceRoles, status }
 * @param {string} userRole - 'employee' | 'manager' | 'hr' | 'admin'
 * @returns {boolean}
 */
export function isInAudience(notice, userRole) {
  if (!notice || !notice.audienceRoles) return false;
  return notice.audienceRoles.includes(userRole);
}

/**
 * Determines whether a user can view a specific notice.
 * Rules:
 *   - HR/Admin: can view all notices (draft, published, archived) in their company
 *   - Manager/Employee: can only view PUBLISHED notices where their role is in audienceRoles
 *   - Author: can view their own drafts (in addition to published)
 *
 * @param {object} notice - { status, audienceRoles, author }
 * @param {object} user - { role, id }
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function canViewNotice(notice, user) {
  if (!notice || !user) return { allowed: false, reason: 'Missing notice or user' };

  // HR/Admin can view everything.
  if (user.role === 'hr' || user.role === 'admin') {
    return { allowed: true };
  }

  // Author can view their own drafts.
  const isAuthor = notice.author && user.id && notice.author.toString() === user.id.toString();
  if (notice.status === 'draft' && isAuthor) {
    return { allowed: true };
  }

  // Manager/Employee: only published + in audience.
  if (notice.status !== 'published') {
    return { allowed: false, reason: 'Notice is not published' };
  }
  if (!isInAudience(notice, user.role)) {
    return { allowed: false, reason: 'Your role is not in the notice audience' };
  }
  return { allowed: true };
}

/**
 * Determines whether a user can manage (create/edit/publish/archive) notices.
 * Only HR/Admin. Managers do NOT gain company-wide HR permissions.
 *
 * @param {string} userRole
 * @returns {boolean}
 */
export function canManageNotices(userRole) {
  return userRole === 'hr' || userRole === 'admin';
}

/**
 * Computes the audience size for a notice (before publication).
 * Returns the count of users whose role is in audienceRoles.
 *
 * @param {Array} audienceRoles - e.g., ['employee', 'manager']
 * @param {Array} users - array of { role, active } docs
 * @returns {number}
 */
export function computeAudienceCount(audienceRoles, users) {
  if (!audienceRoles || audienceRoles.length === 0 || !users) return 0;
  return users.filter((u) => u.active !== false && audienceRoles.includes(u.role)).length;
}

/**
 * Validates a notice's audience roles array.
 * @param {Array} audienceRoles
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateAudienceRoles(audienceRoles) {
  if (!Array.isArray(audienceRoles) || audienceRoles.length === 0) {
    return { ok: false, error: 'At least one audience role is required' };
  }
  const validRoles = ['employee', 'manager', 'hr', 'admin'];
  for (const r of audienceRoles) {
    if (!validRoles.includes(r)) {
      return { ok: false, error: `Invalid audience role: ${r}` };
    }
  }
  return { ok: true };
}

/**
 * Checks whether a notice can be published.
 * Must be in 'draft' status.
 */
export function canPublish(notice) {
  if (!notice) return { ok: false, error: 'Notice not found' };
  if (notice.status !== 'draft') {
    return { ok: false, error: `Cannot publish a notice in '${notice.status}' state` };
  }
  return { ok: true };
}

/**
 * Checks whether a notice can be archived.
 * Must be in 'published' status.
 */
export function canArchive(notice) {
  if (!notice) return { ok: false, error: 'Notice not found' };
  if (notice.status !== 'published') {
    return { ok: false, error: `Cannot archive a notice in '${notice.status}' state` };
  }
  return { ok: true };
}
