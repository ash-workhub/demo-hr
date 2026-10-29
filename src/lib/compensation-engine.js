// src/lib/compensation-engine.js
// V3 Step 2 — pure functions for compensation calculation + validation.
// No DB, no React, no side effects — fully unit-testable with Vitest.
//
// Money-safe arithmetic: all amounts are integer paisa (1 BDT = 100 paisa).
// No floating-point operations. Display layer divides by 100 for rendering.
// Rounding: amounts are always integers. If a conversion produces a fraction,
// round to the nearest integer paisa (Math.round).

/**
 * Computes gross pay = basePay + sum(allowances.amount).
 * All values are integer paisa.
 *
 * @param {number} basePay — integer paisa
 * @param {Array} allowances — [{ name, amount }] where amount is integer paisa
 * @returns {number} gross pay in integer paisa
 */
export function computeGrossPay(basePay, allowances = []) {
  const base = Math.max(0, Math.round(basePay || 0));
  const allowanceSum = (allowances || []).reduce(
    (sum, a) => sum + Math.max(0, Math.round(a.amount || 0)),
    0
  );
  return base + allowanceSum;
}

/**
 * Converts paisa to display currency string.
 * @param {number} paisa — integer paisa
 * @param {string} currency — display currency label (e.g., "BDT")
 * @returns {string} formatted string (e.g., "BDT 50,000.00")
 */
export function formatMoney(paisa, currency = 'BDT') {
  const bdt = (Math.round(paisa || 0) / 100).toFixed(2);
  return `${currency} ${Number(bdt).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Validates an allowance array.
 * Rules:
 *   - Each allowance must have a non-empty name (max 50 chars)
 *   - Each allowance amount must be a non-negative integer
 *   - Allowance names must be unique within the same record
 *
 * @param {Array} allowances
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateAllowances(allowances) {
  if (!allowances || allowances.length === 0) return { ok: true };

  const seenNames = new Set();
  for (const a of allowances) {
    if (!a.name || a.name.trim().length === 0) {
      return { ok: false, error: 'Allowance name is required' };
    }
    if (a.name.trim().length > 50) {
      return { ok: false, error: `Allowance name '${a.name}' exceeds 50 characters` };
    }
    if (seenNames.has(a.name.trim().toLowerCase())) {
      return { ok: false, error: `Duplicate allowance name: '${a.name}'` };
    }
    seenNames.add(a.name.trim().toLowerCase());

    if (typeof a.amount !== 'number' || a.amount < 0 || !Number.isInteger(a.amount)) {
      return { ok: false, error: `Allowance '${a.name}' amount must be a non-negative integer (paisa)` };
    }
  }
  return { ok: true };
}

/**
 * Validates a compensation record's data.
 *
 * @param {object} data — { basePay, allowances, effectiveDate }
 * @param {Date|string|null} prevEffectiveDate — the previous record's effectiveDate (if any)
 * @param {Date|string|null} employeeJoinDate — the employee's join date
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateCompensation(data, prevEffectiveDate, employeeJoinDate) {
  // Base pay validation
  if (typeof data.basePay !== 'number' || data.basePay < 0 || !Number.isInteger(data.basePay)) {
    return { ok: false, error: 'Base pay must be a non-negative integer (paisa)' };
  }

  // Allowances validation
  const allowanceCheck = validateAllowances(data.allowances);
  if (!allowanceCheck.ok) return { ok: false, error: allowanceCheck.error };

  // Effective date validation
  if (!data.effectiveDate || isNaN(new Date(data.effectiveDate).getTime())) {
    return { ok: false, error: 'Valid effective date is required' };
  }

  const effDate = new Date(data.effectiveDate);
  effDate.setHours(0, 0, 0, 0);

  // Must not be before employee's join date
  if (employeeJoinDate) {
    const jd = new Date(employeeJoinDate);
    jd.setHours(0, 0, 0, 0);
    if (effDate < jd) {
      return { ok: false, error: `Effective date cannot be before the employee's join date (${jd.toLocaleDateString('en-GB')})` };
    }
  }

  // Must not be before the previous record's effective date (chronological order)
  if (prevEffectiveDate) {
    const prev = new Date(prevEffectiveDate);
    prev.setHours(0, 0, 0, 0);
    if (effDate < prev) {
      return { ok: false, error: `Effective date cannot be before the previous compensation record's effective date (${prev.toLocaleDateString('en-GB')})` };
    }
  }

  return { ok: true };
}

/**
 * Computes the end date for the previous compensation record when a new one is created.
 * endDate = newEffectiveDate - 1 day.
 *
 * @param {Date|string} newEffectiveDate
 * @returns {Date}
 */
export function computePrevEndDate(newEffectiveDate) {
  const d = new Date(newEffectiveDate);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  return d;
}

/**
 * Returns a safe (non-sensitive for non-payroll views) representation.
 * For payroll routes, includes all fields. For non-payroll routes, returns null.
 *
 * @param {object} record — CompensationRecord doc
 * @param {string} currency — display currency label
 * @returns {object} safe representation
 */
export function toSafeCompensation(record, currency = 'BDT') {
  if (!record) return null;
  return {
    id: record._id.toString(),
    employeeId: record.employeeId ? record.employeeId.toString() : null,
    basePay: record.basePay,
    basePayDisplay: formatMoney(record.basePay, currency),
    allowances: (record.allowances || []).map((a) => ({
      name: a.name,
      amount: a.amount,
      amountDisplay: formatMoney(a.amount, currency),
    })),
    grossPay: record.grossPay,
    grossPayDisplay: formatMoney(record.grossPay, currency),
    effectiveDate: record.effectiveDate,
    endDate: record.endDate,
    isCurrent: record.endDate === null,
    history: (record.history || []).map((h) => ({
      action: h.action,
      byName: h.byName,
      byRole: h.byRole,
      note: h.note,
      at: h.at,
    })),
  };
}
