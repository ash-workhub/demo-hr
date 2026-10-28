// src/lib/leave-engine.js
// Pure functions for the leave approval state machine. No DB, no React, no side effects.
// Every function here is unit-testable with Vitest without any mocks.
//
// State machine:
//   pending_manager --manager_approve--> pending_hr --hr_approve--> approved
//   pending_manager --manager_reject--> rejected
//   pending_hr      --hr_reject-->      rejected
//   any active state --cancel-->        cancelled  (only by the employee who owns it)

export const LEAVE_STATUS = [
  'pending_manager',
  'pending_hr',
  'approved',
  'rejected',
  'cancelled',
];

export const LEAVE_TYPES = ['casual', 'sick', 'earned', 'unpaid'];

export const APPROVER_ROLE = {
  pending_manager: 'manager',
  pending_hr: 'hr',
};

/** True if the leave is in a state where someone can still act on it. */
export function isActive(status) {
  return status === 'pending_manager' || status === 'pending_hr';
}

/** True if the leave has reached a final state (no further actions possible). */
export function isFinal(status) {
  return status === 'approved' || status === 'rejected' || status === 'cancelled';
}

/**
 * Calculate the number of leave days between two dates (inclusive), excluding weekends.
 * Half-day is not supported via date range — set days manually if needed.
 * @param {string|Date} startDate
 * @param {string|Date} endDate
 * @returns {number} integer >= 1
 */
export function calculateDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start) || isNaN(end)) throw new Error('Invalid date(s)');
  if (end < start) throw new Error('End date must be on or after start date');

  // Normalize to midnight local to avoid DST/time-of-day issues.
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  let days = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const dow = cursor.getDay(); // 0 = Sun, 6 = Sat
    if (dow !== 0 && dow !== 6) days++;
    cursor.setDate(cursor.getDate() + 1);
  }
  // Minimum 0.5 days (allow half-day via date math even if weekend-only).
  return Math.max(0.5, days);
}

/**
 * Check whether the employee has enough leave balance for the request.
 * Returns { ok: true } or { ok: false, reason, balance, requested }.
 *
 * @param {object} balance - LeaveBalance doc: { casual: {total, used}, sick: {...}, earned: {...}, unpaid: {used} }
 * @param {string} leaveType - one of LEAVE_TYPES
 * @param {number} days - requested days
 */
export function checkBalance(balance, leaveType, days) {
  if (!LEAVE_TYPES.includes(leaveType)) {
    return { ok: false, reason: `Invalid leave type: ${leaveType}` };
  }
  if (typeof days !== 'number' || days <= 0) {
    return { ok: false, reason: 'Days must be a positive number' };
  }

  // Unpaid leave has no cap.
  if (leaveType === 'unpaid') {
    return { ok: true, balance: { used: balance?.unpaid?.used || 0 }, requested: days };
  }

  const bucket = balance?.[leaveType];
  if (!bucket) return { ok: false, reason: `No balance record for ${leaveType}` };

  const remaining = (bucket.total || 0) - (bucket.used || 0);
  if (remaining < days) {
    return {
      ok: false,
      reason: `Insufficient ${leaveType} balance: ${remaining} day(s) remaining, ${days} requested`,
      balance: { total: bucket.total, used: bucket.used, remaining },
      requested: days,
    };
  }
  return {
    ok: true,
    balance: { total: bucket.total, used: bucket.used, remaining },
    requested: days,
  };
}

/**
 * Determine the next status after an action.
 *
 * @param {string} currentStatus - one of LEAVE_STATUS
 * @param {string} action - 'approve' | 'reject' | 'cancel'
 * @param {string} actorRole - 'manager' | 'hr' | 'admin' | 'employee'
 * @returns {{ nextStatus: string, historyAction: string } | { error: string }}
 */
export function transition(currentStatus, action, actorRole) {
  // --- Cancel: only the owner (employee) can cancel, and only from an active state ---
  if (action === 'cancel') {
    if (!isActive(currentStatus)) {
      return { error: `Cannot cancel a leave in '${currentStatus}' state` };
    }
    return { nextStatus: 'cancelled', historyAction: 'cancelled' };
  }

  // --- Reject ---
  if (action === 'reject') {
    if (!isActive(currentStatus)) {
      return { error: `Cannot reject a leave in '${currentStatus}' state` };
    }
    const requiredRole = APPROVER_ROLE[currentStatus];
    if (actorRole !== requiredRole && actorRole !== 'admin') {
      return { error: `Only ${requiredRole} (or admin) can reject at this stage` };
    }
    return {
      nextStatus: 'rejected',
      historyAction: currentStatus === 'pending_manager' ? 'manager_rejected' : 'hr_rejected',
    };
  }

  // --- Approve ---
  if (action === 'approve') {
    if (!isActive(currentStatus)) {
      return { error: `Cannot approve a leave in '${currentStatus}' state` };
    }
    const requiredRole = APPROVER_ROLE[currentStatus];
    if (actorRole !== requiredRole && actorRole !== 'admin') {
      return { error: `Only ${requiredRole} (or admin) can approve at this stage` };
    }
    if (currentStatus === 'pending_manager') {
      return { nextStatus: 'pending_hr', historyAction: 'manager_approved' };
    }
    // pending_hr -> approved (final)
    return { nextStatus: 'approved', historyAction: 'hr_approved' };
  }

  return { error: `Unknown action: ${action}` };
}

/**
 * Returns the role that needs to act next on this leave, or null if final.
 * @param {string} status
 */
export function nextApproverRole(status) {
  if (!isActive(status)) return null;
  return APPROVER_ROLE[status]; // 'manager' or 'hr'
}

/**
 * Computes the new balance after a leave is finally approved.
 * Mutates a copy and returns it.
 * @param {object} balance - LeaveBalance doc
 * @param {string} leaveType
 * @param {number} days
 */
export function applyApprovalToBalance(balance, leaveType, days) {
  const next = JSON.parse(JSON.stringify(balance));
  if (leaveType === 'unpaid') {
    next.unpaid = next.unpaid || { used: 0 };
    next.unpaid.used = (next.unpaid.used || 0) + days;
  } else if (next[leaveType]) {
    next[leaveType].used = (next[leaveType].used || 0) + days;
  }
  return next;
}
