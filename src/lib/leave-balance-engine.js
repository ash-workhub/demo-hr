// src/lib/leave-balance-engine.js
// V2 Step 3 — pure functions for leave balance reconciliation.
// No DB, no React, no side effects — fully unit-testable with Vitest.
//
// Reconciliation formula:
//   remaining = quota + sum(adjustments) - used
//   available = remaining - pending
//
// Unlimited types (isUnlimited=true): remaining = Infinity, always available.
//
// Year attribution: adjustments for year N only affect year N's balance.
// Adjustments are append-only; this engine sums them, never overwrites.

/**
 * Computes the remaining balance for a leave type.
 *
 * @param {number} quota — the base quota (days). Ignored if isUnlimited.
 * @param {number} adjustmentsTotal — sum of approved adjustments (signed).
 * @param {number} used — sum of approved leave days.
 * @param {boolean} isUnlimited — if true, returns Infinity (no cap).
 * @returns {number} remaining days (Infinity for unlimited)
 */
export function computeRemaining(quota, adjustmentsTotal, used, isUnlimited) {
  if (isUnlimited) return Infinity;
  const q = quota || 0;
  const a = adjustmentsTotal || 0;
  const u = used || 0;
  return q + a - u;
}

/**
 * Sums all approved adjustments for a given leave type code.
 *
 * @param {Array} adjustments — array of { leaveTypeCode, amount, year }
 * @param {string} leaveTypeCode
 * @param {number} year — only sum adjustments for this year
 * @returns {number} signed total
 */
export function sumAdjustments(adjustments, leaveTypeCode, year) {
  if (!adjustments || adjustments.length === 0) return 0;
  return adjustments
    .filter((a) => a.leaveTypeCode === leaveTypeCode && a.year === year)
    .reduce((sum, a) => sum + (a.amount || 0), 0);
}

/**
 * Full balance reconciliation for one leave type.
 *
 * @param {object} params
 *   - quota: number (base quota)
 *   - adjustmentsTotal: number (cached sum, or recompute from adjustments array)
 *   - used: number (approved leave days)
 *   - pending: number (pending leave days)
 *   - isUnlimited: boolean
 * @returns {object} { quota, adjustmentsTotal, used, pending, remaining, available, isUnlimited }
 */
export function reconcileBalance({ quota, adjustmentsTotal, used, pending, isUnlimited }) {
  const remaining = computeRemaining(quota, adjustmentsTotal, used, isUnlimited);
  const p = pending || 0;
  const available = isUnlimited ? Infinity : remaining - p;
  return {
    quota: quota || 0,
    adjustmentsTotal: adjustmentsTotal || 0,
    used: used || 0,
    pending: p,
    remaining,
    available,
    isUnlimited: !!isUnlimited,
  };
}

/**
 * V2 balance check: can the employee take `days` of this leave type?
 *
 * @param {object} params
 *   - quota, adjustmentsTotal, used, pending, isUnlimited
 *   - days: number requested
 * @returns {{ ok: boolean, reason?: string, balance?: object }}
 */
export function checkBalanceV2({ quota, adjustmentsTotal, used, pending, isUnlimited, days }) {
  if (typeof days !== 'number' || days <= 0) {
    return { ok: false, reason: 'Days must be a positive number' };
  }

  if (isUnlimited) {
    return {
      ok: true,
      balance: reconcileBalance({ quota, adjustmentsTotal, used, pending, isUnlimited }),
    };
  }

  const rec = reconcileBalance({ quota, adjustmentsTotal, used, pending, isUnlimited });
  if (rec.available < days) {
    return {
      ok: false,
      reason: `Insufficient balance: ${rec.available} day(s) available (${rec.quota} quota + ${rec.adjustmentsTotal} adjustments - ${rec.used} used - ${rec.pending} pending), ${days} requested`,
      balance: rec,
    };
  }
  return { ok: true, balance: rec };
}

/**
 * Applies a new adjustment to the cached adjustmentsTotal.
 * Returns the new total — does NOT mutate the input.
 *
 * @param {number} currentAdjustmentsTotal
 * @param {number} signedAmount — positive or negative
 * @returns {number} new total
 */
export function applyAdjustment(currentAdjustmentsTotal, signedAmount) {
  return (currentAdjustmentsTotal || 0) + (signedAmount || 0);
}

/**
 * Computes a full balance statement for an employee for a year.
 * Returns one entry per leave type with the reconciled values.
 *
 * @param {object} balance — LeaveBalance doc (or null)
 * @param {Array} leaveTypes — array of { code, name, isUnlimited, defaultQuota }
 * @param {Array} adjustments — all LeaveAdjustment docs for this employee+year
 * @param {Array} pendingLeaves — pending LeaveRequest docs for this employee
 * @param {number} year
 * @returns {Array} [{ code, name, isUnlimited, quota, adjustmentsTotal, used, pending, remaining, available }]
 */
export function buildStatement(balance, leaveTypes, adjustments, pendingLeaves, year) {
  return leaveTypes.map((lt) => {
    const code = lt.code;
    const isUnlimited = lt.isUnlimited;
    // Quota: if balance exists and has a total for this type, use it; else defaultQuota.
    let quota = lt.defaultQuota || 0;
    let used = 0;
    if (balance) {
      const bucket = balance[code];
      if (bucket) {
        quota = bucket.total != null ? bucket.total : quota;
        used = bucket.used || 0;
      } else if (code === 'unpaid' && balance.unpaid) {
        used = balance.unpaid.used || 0;
      }
    }
    const adjustmentsTotal = sumAdjustments(adjustments, code, year);
    const pending = (pendingLeaves || [])
      .filter((l) => l.leaveType === code)
      .reduce((sum, l) => sum + (l.days || 0), 0);
    const rec = reconcileBalance({ quota, adjustmentsTotal, used, pending, isUnlimited });
    return {
      code,
      name: lt.name,
      isUnlimited,
      ...rec,
    };
  });
}
