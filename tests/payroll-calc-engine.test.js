// tests/payroll-calc-engine.test.js
// V3 Step 3 — tests for illustrative monthly gross calculation.
// Run: bun run test
import { describe, it, expect } from 'vitest';
import {
  calendarDaysInMonth,
  getEffectiveCompensation,
  classifyDay,
  computeMonthlyGross,
  previewCalculation,
} from '../src/lib/payroll-calc-engine.js';

// ============================================================
// Month length
// ============================================================
describe('calendarDaysInMonth', () => {
  it('returns 31 for January', () => {
    expect(calendarDaysInMonth(2026, 1)).toBe(31);
  });
  it('returns 28 for February (non-leap year)', () => {
    expect(calendarDaysInMonth(2025, 2)).toBe(28);
  });
  it('returns 29 for February (leap year)', () => {
    expect(calendarDaysInMonth(2024, 2)).toBe(29);
  });
  it('returns 30 for April', () => {
    expect(calendarDaysInMonth(2026, 4)).toBe(30);
  });
  it('returns 31 for December', () => {
    expect(calendarDaysInMonth(2026, 12)).toBe(31);
  });
  it('returns 0 for invalid month', () => {
    expect(calendarDaysInMonth(2026, 0)).toBe(0);
    expect(calendarDaysInMonth(2026, 13)).toBe(0);
  });
  it('returns 0 for missing inputs', () => {
    expect(calendarDaysInMonth(null, 1)).toBe(0);
    expect(calendarDaysInMonth(2026, null)).toBe(0);
  });
});

// ============================================================
// Effective-date boundaries
// ============================================================
describe('getEffectiveCompensation', () => {
  const records = [
    { basePay: 5000000, allowances: [], grossPay: 5000000, effectiveDate: '2026-01-01', endDate: '2026-06-30' },
    { basePay: 6000000, allowances: [{ name: 'Transport', amount: 500000 }], grossPay: 6500000, effectiveDate: '2026-07-01', endDate: null },
  ];

  it('returns the first record for a date within its range', () => {
    const r = getEffectiveCompensation('2026-03-15', records);
    expect(r.grossPay).toBe(5000000);
  });
  it('returns the second record for a date after its effective date', () => {
    const r = getEffectiveCompensation('2026-08-15', records);
    expect(r.grossPay).toBe(6500000);
  });
  it('returns null for a date before any record', () => {
    expect(getEffectiveCompensation('2025-01-01', records)).toBeNull();
  });
  it('returns the correct record on the effective date boundary', () => {
    const r = getEffectiveCompensation('2026-07-01', records);
    expect(r.grossPay).toBe(6500000);
  });
  it('returns the correct record on the end date boundary', () => {
    const r = getEffectiveCompensation('2026-06-30', records);
    expect(r.grossPay).toBe(5000000);
  });
  it('returns null for empty records', () => {
    expect(getEffectiveCompensation('2026-01-01', [])).toBeNull();
  });
  it('returns null for null records', () => {
    expect(getEffectiveCompensation('2026-01-01', null)).toBeNull();
  });
});

// ============================================================
// Day classification
// ============================================================
describe('classifyDay', () => {
  it('present → payable', () => {
    expect(classifyDay({ status: 'present' }, null).category).toBe('payable');
  });
  it('late → payable', () => {
    expect(classifyDay({ status: 'late' }, null).category).toBe('payable');
  });
  it('half-day → payable', () => {
    expect(classifyDay({ status: 'half-day' }, null).category).toBe('payable');
  });
  it('holiday → payable', () => {
    expect(classifyDay({ status: 'holiday' }, null).category).toBe('payable');
  });
  it('week-off → payable', () => {
    expect(classifyDay({ status: 'week-off' }, null).category).toBe('payable');
  });
  it('absent → absent', () => {
    expect(classifyDay({ status: 'absent' }, null).category).toBe('absent');
  });
  it('pending → payable (no deduction inferred)', () => {
    const r = classifyDay({ status: 'pending' }, null);
    expect(r.category).toBe('payable');
    expect(r.note).toMatch(/Pending/);
  });
  it('null attendance → payable', () => {
    expect(classifyDay(null, null).category).toBe('payable');
  });
  it('approved unpaid leave → unpaid_leave', () => {
    expect(classifyDay(null, { leaveType: 'unpaid', status: 'approved' }).category).toBe('unpaid_leave');
  });
  it('approved casual leave → paid_leave', () => {
    expect(classifyDay(null, { leaveType: 'casual', status: 'approved' }).category).toBe('paid_leave');
  });
  it('approved sick leave → paid_leave', () => {
    expect(classifyDay(null, { leaveType: 'sick', status: 'approved' }).category).toBe('paid_leave');
  });
  it('pending leave (not approved) → ignored, falls back to attendance', () => {
    expect(classifyDay({ status: 'present' }, { leaveType: 'casual', status: 'pending_manager' }).category).toBe('payable');
  });

  // Non-duplication tests
  it('NON-DUPLICATION: absent + unpaid leave → unpaid_leave (not both)', () => {
    const r = classifyDay({ status: 'absent' }, { leaveType: 'unpaid', status: 'approved' });
    expect(r.category).toBe('unpaid_leave');
    expect(r.note).toMatch(/not double-counted/);
  });
  it('NON-DUPLICATION: absent + paid leave → paid_leave (absence is covered by leave)', () => {
    const r = classifyDay({ status: 'absent' }, { leaveType: 'casual', status: 'approved' });
    expect(r.category).toBe('paid_leave');
  });
  it('AMBIGUOUS: attendance says leave but no approved leave request → ambiguous', () => {
    const r = classifyDay({ status: 'leave' }, null);
    expect(r.category).toBe('ambiguous');
    expect(r.note).toMatch(/no approved leave/);
  });
  it('AMBIGUOUS: unknown status → payable with note', () => {
    const r = classifyDay({ status: 'unknown' }, null);
    expect(r.category).toBe('payable');
    expect(r.note).toMatch(/Unknown/);
  });
});

// ============================================================
// Monthly gross calculation — FULL_MONTH mode
// ============================================================
describe('computeMonthlyGross — FULL_MONTH', () => {
  const comp = { basePay: 5000000, allowances: [{ name: 'Transport', amount: 500000 }], grossPay: 5500000 };

  it('returns full monthly gross with no deductions', () => {
    const r = computeMonthlyGross({
      year: 2026, month: 1, mode: 'FULL_MONTH', compensation: comp,
      dayClassifications: Array(31).fill({ category: 'payable' }),
    });
    expect(r.illustrativeGross).toBe(5500000);
    expect(r.monthlyGross).toBe(5500000);
    expect(r.payableDays).toBe(31);
    expect(r.absentDays).toBe(0);
  });

  it('returns full gross even with absences (FULL_MONTH = no deductions)', () => {
    const r = computeMonthlyGross({
      year: 2026, month: 1, mode: 'FULL_MONTH', compensation: comp,
      dayClassifications: [
        ...Array(20).fill({ category: 'payable' }),
        ...Array(11).fill({ category: 'absent' }),
      ],
    });
    expect(r.illustrativeGross).toBe(5500000);
    expect(r.absentDays).toBe(11);
  });

  it('returns 0 for no compensation', () => {
    const r = computeMonthlyGross({
      year: 2026, month: 1, mode: 'FULL_MONTH', compensation: null,
      dayClassifications: [],
    });
    expect(r.illustrativeGross).toBe(0);
    expect(r.limitations).toHaveLength(1);
    expect(r.limitations[0]).toMatch(/No effective compensation/);
  });
});

// ============================================================
// Monthly gross calculation — PRORATED mode
// ============================================================
describe('computeMonthlyGross — PRORATED', () => {
  const comp = { basePay: 5000000, allowances: [], grossPay: 5000000 };

  it('full month payable = full gross', () => {
    const r = computeMonthlyGross({
      year: 2026, month: 1, mode: 'PRORATED', compensation: comp,
      dayClassifications: Array(31).fill({ category: 'payable' }),
    });
    expect(r.illustrativeGross).toBe(5000000);
    expect(r.payableDays).toBe(31);
    expect(r.calendarDays).toBe(31);
  });

  it('half month absent = half gross (rounded)', () => {
    // 5000000 × 15 ÷ 30 = 2500000 (exact, April = 30 days)
    const r = computeMonthlyGross({
      year: 2026, month: 4, mode: 'PRORATED', compensation: comp,
      dayClassifications: [
        ...Array(15).fill({ category: 'payable' }),
        ...Array(15).fill({ category: 'absent' }),
      ],
    });
    expect(r.payableDays).toBe(15);
    expect(r.calendarDays).toBe(30);
    expect(r.illustrativeGross).toBe(2500000);
  });

  it('zero payable days = 0 gross', () => {
    const r = computeMonthlyGross({
      year: 2026, month: 1, mode: 'PRORATED', compensation: comp,
      dayClassifications: Array(31).fill({ category: 'absent' }),
    });
    expect(r.payableDays).toBe(0);
    expect(r.illustrativeGross).toBe(0);
  });

  it('paid leave counts as payable', () => {
    const r = computeMonthlyGross({
      year: 2026, month: 4, mode: 'PRORATED', compensation: comp,
      dayClassifications: [
        ...Array(20).fill({ category: 'payable' }),
        ...Array(10).fill({ category: 'paid_leave' }),
      ],
    });
    expect(r.payableDays).toBe(30);
    expect(r.paidLeaveDays).toBe(10);
    expect(r.illustrativeGross).toBe(5000000);
  });

  it('unpaid leave reduces payable days', () => {
    // 5000000 × 25 ÷ 30 = 4166666.67 → 4166667 (rounded)
    const r = computeMonthlyGross({
      year: 2026, month: 4, mode: 'PRORATED', compensation: comp,
      dayClassifications: [
        ...Array(25).fill({ category: 'payable' }),
        ...Array(5).fill({ category: 'unpaid_leave' }),
      ],
    });
    expect(r.payableDays).toBe(25);
    expect(r.unpaidLeaveDays).toBe(5);
    expect(r.illustrativeGross).toBe(4166667); // Math.round(5000000 × 25 / 30)
  });

  it('absent reduces payable days', () => {
    // 5000000 × 28 ÷ 31 = 4516129.03 → 4516129
    const r = computeMonthlyGross({
      year: 2026, month: 1, mode: 'PRORATED', compensation: comp,
      dayClassifications: [
        ...Array(28).fill({ category: 'payable' }),
        ...Array(3).fill({ category: 'absent' }),
      ],
    });
    expect(r.payableDays).toBe(28);
    expect(r.absentDays).toBe(3);
    expect(r.illustrativeGross).toBe(4516129);
  });
});

// ============================================================
// Rounding
// ============================================================
describe('Rounding (money-safe)', () => {
  const comp = { basePay: 5000000, allowances: [], grossPay: 5000000 };

  it('rounds half up (Math.round)', () => {
    // 5000000 × 1 ÷ 3 = 1666666.67 → 1666667
    // March = 31 days, 1 payable day
    const r = computeMonthlyGross({
      year: 2026, month: 3, mode: 'PRORATED', compensation: comp,
      dayClassifications: [
        { category: 'payable' },
        ...Array(30).fill({ category: 'absent' }),
      ],
    });
    // 5000000 × 1 / 31 = 161290.32 → 161290
    expect(r.illustrativeGross).toBe(Math.round(5000000 * 1 / 31));
  });

  it('exact division = no rounding needed', () => {
    // 6000000 × 15 ÷ 30 = 3000000 (exact)
    const r = computeMonthlyGross({
      year: 2026, month: 4, mode: 'PRORATED', compensation: { grossPay: 6000000 },
      dayClassifications: [
        ...Array(15).fill({ category: 'payable' }),
        ...Array(15).fill({ category: 'absent' }),
      ],
    });
    expect(r.illustrativeGross).toBe(3000000);
  });

  it('all amounts are integer paisa (no floats)', () => {
    const r = computeMonthlyGross({
      year: 2026, month: 1, mode: 'PRORATED', compensation: comp,
      dayClassifications: [
        ...Array(10).fill({ category: 'payable' }),
        ...Array(21).fill({ category: 'absent' }),
      ],
    });
    expect(Number.isInteger(r.illustrativeGross)).toBe(true);
    expect(Number.isInteger(r.monthlyGross)).toBe(true);
  });
});

// ============================================================
// Ambiguous V2 inputs
// ============================================================
describe('Ambiguous V2 inputs', () => {
  const comp = { basePay: 5000000, allowances: [], grossPay: 5000000 };

  it('ambiguous days are treated as payable (no deduction inferred)', () => {
    const r = computeMonthlyGross({
      year: 2026, month: 4, mode: 'PRORATED', compensation: comp,
      dayClassifications: [
        ...Array(28).fill({ category: 'payable' }),
        { category: 'ambiguous', note: 'Attendance marked as leave but no approved leave request found' },
        { category: 'ambiguous', note: 'Unknown status' },
      ],
    });
    expect(r.ambiguousDays).toBe(2);
    expect(r.payableDays).toBe(30); // ambiguous treated as payable
    expect(r.illustrativeGross).toBe(5000000); // full month payable
    expect(r.limitations.length).toBeGreaterThan(0);
    expect(r.limitations.some(l => l.includes('ambiguous'))).toBe(true);
  });

  it('limitations include notes for ambiguous days', () => {
    const r = computeMonthlyGross({
      year: 2026, month: 4, mode: 'PRORATED', compensation: comp,
      dayClassifications: [
        ...Array(29).fill({ category: 'payable' }),
        { category: 'ambiguous', note: 'Custom ambiguity note' },
      ],
    });
    expect(r.limitations.some(l => l.includes('Custom ambiguity note'))).toBe(true);
  });
});

// ============================================================
// Non-duplication
// ============================================================
describe('Non-duplication (absent + unpaid leave same day)', () => {
  it('a day classified as unpaid_leave is NOT also counted as absent', () => {
    const r = computeMonthlyGross({
      year: 2026, month: 4, mode: 'PRORATED',
      compensation: { grossPay: 5000000 },
      dayClassifications: [
        ...Array(25).fill({ category: 'payable' }),
        ...Array(5).fill({ category: 'unpaid_leave' }),
      ],
    });
    expect(r.unpaidLeaveDays).toBe(5);
    expect(r.absentDays).toBe(0); // NOT double-counted
    expect(r.payableDays).toBe(25); // unpaid leave NOT payable
  });

  it('a day classified as paid_leave IS payable and NOT absent', () => {
    const r = computeMonthlyGross({
      year: 2026, month: 4, mode: 'PRORATED',
      compensation: { grossPay: 5000000 },
      dayClassifications: [
        ...Array(20).fill({ category: 'payable' }),
        ...Array(10).fill({ category: 'paid_leave' }),
      ],
    });
    expect(r.paidLeaveDays).toBe(10);
    expect(r.absentDays).toBe(0);
    expect(r.payableDays).toBe(30); // paid leave IS payable
  });

  it('classifyDay does not return both absent and unpaid_leave', () => {
    const r = classifyDay({ status: 'absent' }, { leaveType: 'unpaid', status: 'approved' });
    expect(r.category).toBe('unpaid_leave');
    expect(r.category).not.toBe('absent');
  });
});

// ============================================================
// Zero / partial days
// ============================================================
describe('Zero and partial days', () => {
  const comp = { basePay: 5000000, allowances: [], grossPay: 5000000 };

  it('zero payable days → 0 gross', () => {
    const r = computeMonthlyGross({
      year: 2026, month: 1, mode: 'PRORATED', compensation: comp,
      dayClassifications: Array(31).fill({ category: 'absent' }),
    });
    expect(r.payableDays).toBe(0);
    expect(r.illustrativeGross).toBe(0);
  });

  it('one payable day out of 31 → prorated', () => {
    const r = computeMonthlyGross({
      year: 2026, month: 1, mode: 'PRORATED', compensation: comp,
      dayClassifications: [
        { category: 'payable' },
        ...Array(30).fill({ category: 'absent' }),
      ],
    });
    expect(r.payableDays).toBe(1);
    expect(r.illustrativeGross).toBe(Math.round(5000000 / 31));
  });

  it('half-day attendance → payable', () => {
    const r = computeMonthlyGross({
      year: 2026, month: 4, mode: 'PRORATED', compensation: comp,
      dayClassifications: Array(30).fill({ category: 'payable' }),
    });
    expect(r.payableDays).toBe(30);
    expect(r.illustrativeGross).toBe(5000000);
  });
});

// ============================================================
// Preview
// ============================================================
describe('previewCalculation', () => {
  it('returns assumptions + day counts + calculation + limitations', () => {
    const r = previewCalculation({
      year: 2026, month: 4, mode: 'PRORATED',
      compensation: { basePay: 5000000, allowances: [], grossPay: 5000000, effectiveDate: '2026-01-01' },
      dayClassifications: [
        ...Array(25).fill({ category: 'payable' }),
        ...Array(5).fill({ category: 'unpaid_leave' }),
      ],
    });
    expect(r.assumptions.year).toBe(2026);
    expect(r.assumptions.month).toBe(4);
    expect(r.assumptions.mode).toBe('PRORATED');
    expect(r.assumptions.calendarDays).toBe(30);
    expect(r.assumptions.compensationFound).toBe(true);
    expect(r.dayCounts.payable).toBe(25);
    expect(r.dayCounts.unpaidLeave).toBe(5);
    expect(r.calculation.illustrativeGross).toBe(4166667);
    expect(r.calculation.formula).toContain('× 25 ÷ 30');
    expect(r.calculation.roundingNote).toMatch(/Math.round/);
  });

  it('reports limitation when no compensation found', () => {
    const r = previewCalculation({
      year: 2026, month: 1, mode: 'FULL_MONTH',
      compensation: null,
      dayClassifications: [],
    });
    expect(r.assumptions.compensationFound).toBe(false);
    expect(r.limitations.length).toBeGreaterThan(0);
  });
});

// ============================================================
// No tax/deductions/net computed
// ============================================================
describe('No tax/deductions/net computed', () => {
  it('result contains no tax/deduction/net fields', () => {
    const r = computeMonthlyGross({
      year: 2026, month: 1, mode: 'FULL_MONTH',
      compensation: { grossPay: 5000000 },
      dayClassifications: [],
    });
    const keys = Object.keys(r);
    const forbidden = keys.filter(k =>
      /tax|deduction|net|takeHome|benefit|recovery|statutory/i.test(k)
    );
    expect(forbidden).toHaveLength(0);
  });
});
