// src/lib/payroll-calc-engine.js
// V3 Step 3 — pure, unit-tested illustrative monthly gross calculation service.
// No DB, no React, no side effects — fully unit-testable with Vitest.
//
// Purpose: compute an ILLUSTRATIVE monthly gross for a payroll period using the
// effective monthly compensation (from CompensationRecord) and V2 attendance/leave
// data. This is a demo-only calculation — no tax, statutory deductions, benefits,
// recoveries, net/take-home pay, or legal entitlements are computed.
//
// Money-safe arithmetic: all amounts in integer paisa. Division uses Math.round()
// to convert back to integer paisa. Documented: rounding is "round half up" per
// Math.round() semantics (e.g., 1234.5 → 1235).
//
// Two modes:
//   1. FULL_MONTH (default): gross = monthly gross (no deductions)
//   2. PRORATED (demo-only): gross = monthly gross × payableDays ÷ calendarDaysInMonth
//
// Non-duplication rule: a date is EITHER an absence OR an unpaid-leave day,
// never both. If the data is ambiguous (e.g., attendance says 'absent' but a
// leave request for the same date is approved unpaid), the absence takes
// precedence and the leave day is NOT double-counted.
//
// If data is ambiguous and cannot be resolved, NO deduction is inferred — the
// day is treated as payable and the limitation is reported.

/**
 * Returns the number of calendar days in a given month.
 *
 * @param {number} year — e.g., 2026
 * @param {number} month — 1-12 (1 = January)
 * @returns {number} 28-31
 */
export function calendarDaysInMonth(year, month) {
  if (!year || !month || month < 1 || month > 12) return 0;
  // Day 0 of the next month = last day of the current month
  return new Date(year, month, 0).getDate();
}

/**
 * Returns the effective monthly compensation for a given date.
 * Finds the CompensationRecord whose effectiveDate <= date and (endDate >= date OR endDate is null).
 *
 * @param {Date|string} date — the payroll period date
 * @param {Array} compensationRecords — sorted by effectiveDate ascending
 * @returns {object|null} { basePay, allowances, grossPay } or null if no record covers the date
 */
export function getEffectiveCompensation(date, compensationRecords) {
  if (!compensationRecords || compensationRecords.length === 0) return null;
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  // Find the most recent record that covers this date.
  for (let i = compensationRecords.length - 1; i >= 0; i--) {
    const rec = compensationRecords[i];
    const eff = new Date(rec.effectiveDate);
    eff.setHours(0, 0, 0, 0);
    if (eff > d) continue; // not yet effective

    const end = rec.endDate ? new Date(rec.endDate) : null;
    if (end) {
      end.setHours(23, 59, 59, 999);
      if (end < d) continue; // ended before this date
    }

    return {
      basePay: rec.basePay || 0,
      allowances: rec.allowances || [],
      grossPay: rec.grossPay || 0,
      effectiveDate: rec.effectiveDate,
      endDate: rec.endDate,
    };
  }
  return null;
}

/**
 * Classifies a single day's attendance + leave status into a payable/non-payable category.
 * Non-duplication: a date is EITHER absent OR unpaid leave, never both.
 *
 * Categories:
 *   'payable'       — present, late, half-day, holiday, week-off, pending
 *   'absent'        — absent (no leave)
 *   'unpaid_leave'  — approved unpaid leave
 *   'paid_leave'    — approved casual/sick/earned leave
 *   'ambiguous'     — data conflict (e.g., absent + unpaid leave for same day, or
 *                     attendance says 'leave' but no leave request exists)
 *
 * @param {object} attendance — { status, effectiveStatus } or null
 * @param {object} leave — { leaveType, status } or null (only approved leaves)
 * @returns {{ category: string, note?: string }}
 */
export function classifyDay(attendance, leave) {
  const attStatus = attendance?.effectiveStatus || attendance?.status;

  // If there's an approved leave for this day, it takes precedence over attendance.
  if (leave && (leave.status === 'approved')) {
    if (leave.leaveType === 'unpaid') {
      // Non-duplication: if attendance also says 'absent', the unpaid leave takes
      // precedence (the absence IS the unpaid leave — don't double-count).
      if (attStatus === 'absent') {
        return { category: 'unpaid_leave', note: 'Unpaid leave (attendance was absent — not double-counted)' };
      }
      return { category: 'unpaid_leave' };
    }
    // Paid leave types (casual, sick, earned)
    return { category: 'paid_leave' };
  }

  // No approved leave — classify by attendance status.
  if (!attStatus || attStatus === 'pending') {
    return { category: 'payable', note: 'Pending attendance treated as payable (no deduction inferred)' };
  }

  switch (attStatus) {
    case 'present':
    case 'late':
    case 'half-day':
    case 'holiday':
    case 'week-off':
      return { category: 'payable' };
    case 'leave':
      // Attendance says 'leave' but no approved leave request exists → ambiguous.
      return { category: 'ambiguous', note: 'Attendance marked as leave but no approved leave request found' };
    case 'absent':
      return { category: 'absent' };
    default:
      return { category: 'payable', note: `Unknown attendance status '${attStatus}' treated as payable` };
  }
}

/**
 * Computes the illustrative monthly gross for a payroll period.
 *
 * @param {object} params
 *   - year: number (e.g., 2026)
 *   - month: number (1-12)
 *   - mode: 'FULL_MONTH' | 'PRORATED'
 *   - compensation: { basePay, allowances, grossPay } (the effective monthly compensation)
 *   - dayClassifications: Array of { category, note } for each calendar day in the month
 *       (index 0 = day 1, index 1 = day 2, etc.)
 * @returns {object} {
 *     monthlyGross: number (paisa),
 *     payableDays: number,
 *     calendarDays: number,
 *     absentDays: number,
 *     unpaidLeaveDays: number,
 *     paidLeaveDays: number,
 *     ambiguousDays: number,
 *     illustrativeGross: number (paisa),
 *     mode: string,
 *     limitations: string[],
 *     breakdown: { basePay, allowances, grossPay } (in paisa)
 *   }
 */
export function computeMonthlyGross(params) {
  const { year, month, mode = 'FULL_MONTH', compensation, dayClassifications = [] } = params;

  const calDays = calendarDaysInMonth(year, month);
  const limitations = [];

  if (!compensation) {
    return {
      monthlyGross: 0,
      payableDays: 0,
      calendarDays: calDays,
      absentDays: 0,
      unpaidLeaveDays: 0,
      paidLeaveDays: 0,
      ambiguousDays: 0,
      illustrativeGross: 0,
      mode,
      limitations: ['No effective compensation record found for this period'],
      breakdown: { basePay: 0, allowances: [], grossPay: 0 },
    };
  }

  const monthlyGross = compensation.grossPay || 0;
  const basePay = compensation.basePay || 0;
  const allowances = compensation.allowances || [];

  // Count day categories.
  let payableDays = 0;
  let absentDays = 0;
  let unpaidLeaveDays = 0;
  let paidLeaveDays = 0;
  let ambiguousDays = 0;

  for (let i = 0; i < calDays; i++) {
    const cls = dayClassifications[i] || { category: 'payable' };
    switch (cls.category) {
      case 'payable':
        payableDays++;
        break;
      case 'absent':
        absentDays++;
        break;
      case 'unpaid_leave':
        unpaidLeaveDays++;
        break;
      case 'paid_leave':
        paidLeaveDays++;
        payableDays++; // paid leave is still payable
        break;
      case 'ambiguous':
        ambiguousDays++;
        payableDays++; // ambiguous days treated as payable (no deduction inferred)
        if (cls.note) limitations.push(`Day ${i + 1}: ${cls.note}`);
        break;
      default:
        payableDays++;
        break;
    }
  }

  if (ambiguousDays > 0) {
    limitations.push(`${ambiguousDays} ambiguous day(s) treated as payable (no deduction inferred)`);
  }

  let illustrativeGross;

  if (mode === 'FULL_MONTH') {
    // Full-month gross: no deductions.
    illustrativeGross = monthlyGross;
  } else {
    // Prorated: gross × payableDays ÷ calendarDays
    // Money-safe: use integer arithmetic. Multiply first, then divide, then round.
    if (calDays === 0) {
      illustrativeGross = 0;
      limitations.push('Calendar days is 0 — cannot prorate');
    } else {
      // Multiply first (no precision loss), then divide, then round half up.
      const scaled = monthlyGross * payableDays;
      illustrativeGross = Math.round(scaled / calDays);
    }
  }

  return {
    monthlyGross,
    payableDays,
    calendarDays: calDays,
    absentDays,
    unpaidLeaveDays,
    paidLeaveDays,
    ambiguousDays,
    illustrativeGross,
    mode,
    limitations,
    breakdown: { basePay, allowances, grossPay: monthlyGross },
  };
}

/**
 * Returns a safe preview of the calculation assumptions (for HR preview UI).
 * Shows the selected settings and source day counts before calculation.
 *
 * @param {object} params — same as computeMonthlyGross
 * @returns {object} preview with all assumptions + the computed result
 */
export function previewCalculation(params) {
  const result = computeMonthlyGross(params);
  return {
    assumptions: {
      year: params.year,
      month: params.month,
      mode: params.mode || 'FULL_MONTH',
      calendarDays: result.calendarDays,
      compensationFound: !!params.compensation,
      compensationEffectiveDate: params.compensation?.effectiveDate || null,
    },
    dayCounts: {
      payable: result.payableDays,
      absent: result.absentDays,
      unpaidLeave: result.unpaidLeaveDays,
      paidLeave: result.paidLeaveDays,
      ambiguous: result.ambiguousDays,
    },
    calculation: {
      monthlyGross: result.monthlyGross,
      illustrativeGross: result.illustrativeGross,
      formula: result.mode === 'PRORATED'
        ? `${result.monthlyGross} × ${result.payableDays} ÷ ${result.calendarDays} = ${result.illustrativeGross} (rounded)`
        : `${result.monthlyGross} (full month, no deductions)`,
      roundingNote: 'Math.round (round half up) to nearest integer paisa',
    },
    limitations: result.limitations,
  };
}
