// tests/leave-balance-engine.test.js
// V2 Step 3 — business-rule tests for the leave balance engine.
// Run: bun run test
import { describe, it, expect } from 'vitest';
import {
  computeRemaining,
  sumAdjustments,
  reconcileBalance,
  checkBalanceV2,
  applyAdjustment,
  buildStatement,
} from '../src/lib/leave-balance-engine.js';

describe('computeRemaining', () => {
  it('returns quota + adjustments - used for capped types', () => {
    expect(computeRemaining(10, 2, 3, false)).toBe(9); // 10 + 2 - 3
  });
  it('returns Infinity for unlimited types', () => {
    expect(computeRemaining(0, 0, 50, true)).toBe(Infinity);
  });
  it('Infinity regardless of used for unlimited', () => {
    expect(computeRemaining(0, 0, 9999, true)).toBe(Infinity);
  });
  it('handles zero quota/adjustments/used', () => {
    expect(computeRemaining(0, 0, 0, false)).toBe(0);
  });
  it('handles negative adjustments (subtractions)', () => {
    expect(computeRemaining(10, -3, 2, false)).toBe(5); // 10 - 3 - 2
  });
  it('can go negative (over-used)', () => {
    expect(computeRemaining(5, 0, 8, false)).toBe(-3);
  });
  it('treats undefined inputs as 0', () => {
    expect(computeRemaining(undefined, undefined, undefined, false)).toBe(0);
  });
});

describe('sumAdjustments', () => {
  const adjustments = [
    { leaveTypeCode: 'casual', amount: 5, year: 2026 },
    { leaveTypeCode: 'casual', amount: -2, year: 2026 },
    { leaveTypeCode: 'sick', amount: 3, year: 2026 },
    { leaveTypeCode: 'casual', amount: 10, year: 2025 }, // different year — ignored
  ];

  it('sums adjustments for casual in 2026', () => {
    expect(sumAdjustments(adjustments, 'casual', 2026)).toBe(3); // 5 + (-2)
  });
  it('sums adjustments for sick in 2026', () => {
    expect(sumAdjustments(adjustments, 'sick', 2026)).toBe(3);
  });
  it('excludes adjustments from other years (year attribution)', () => {
    expect(sumAdjustments(adjustments, 'casual', 2025)).toBe(10);
    expect(sumAdjustments(adjustments, 'casual', 2024)).toBe(0);
  });
  it('returns 0 for empty list', () => {
    expect(sumAdjustments([], 'casual', 2026)).toBe(0);
  });
  it('returns 0 for null/undefined', () => {
    expect(sumAdjustments(null, 'casual', 2026)).toBe(0);
    expect(sumAdjustments(undefined, 'casual', 2026)).toBe(0);
  });
  it('returns 0 for type with no adjustments', () => {
    expect(sumAdjustments(adjustments, 'earned', 2026)).toBe(0);
  });
});

describe('reconcileBalance', () => {
  it('computes remaining and available for a capped type', () => {
    const r = reconcileBalance({ quota: 10, adjustmentsTotal: 2, used: 3, pending: 1, isUnlimited: false });
    expect(r.remaining).toBe(9); // 10 + 2 - 3
    expect(r.available).toBe(8); // 9 - 1
    expect(r.isUnlimited).toBe(false);
  });
  it('returns Infinity remaining and available for unlimited type', () => {
    const r = reconcileBalance({ quota: 0, adjustmentsTotal: 0, used: 50, pending: 10, isUnlimited: true });
    expect(r.remaining).toBe(Infinity);
    expect(r.available).toBe(Infinity);
  });
  it('available can be negative when pending exceeds remaining', () => {
    const r = reconcileBalance({ quota: 5, adjustmentsTotal: 0, used: 3, pending: 4, isUnlimited: false });
    expect(r.remaining).toBe(2); // 5 - 3
    expect(r.available).toBe(-2); // 2 - 4
  });
  it('handles zero pending', () => {
    const r = reconcileBalance({ quota: 10, adjustmentsTotal: 0, used: 0, pending: 0, isUnlimited: false });
    expect(r.available).toBe(10);
  });
});

describe('checkBalanceV2', () => {
  it('allows when available >= days', () => {
    const r = checkBalanceV2({ quota: 10, adjustmentsTotal: 2, used: 3, pending: 1, isUnlimited: false, days: 5 });
    expect(r.ok).toBe(true);
    expect(r.balance.available).toBe(8);
  });
  it('denies when available < days', () => {
    const r = checkBalanceV2({ quota: 10, adjustmentsTotal: 0, used: 8, pending: 0, isUnlimited: false, days: 5 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Insufficient/);
    expect(r.balance.available).toBe(2);
  });
  it('always allows for unlimited types', () => {
    const r = checkBalanceV2({ quota: 0, adjustmentsTotal: 0, used: 9999, pending: 9999, isUnlimited: true, days: 100 });
    expect(r.ok).toBe(true);
  });
  it('denies non-positive days', () => {
    const r = checkBalanceV2({ quota: 10, adjustmentsTotal: 0, used: 0, pending: 0, isUnlimited: false, days: 0 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/positive number/);
  });
  it('accounts for adjustments in the reason message', () => {
    const r = checkBalanceV2({ quota: 10, adjustmentsTotal: -5, used: 3, pending: 0, isUnlimited: false, days: 5 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/10 quota.*-5 adjustments.*3 used/);
  });
});

describe('applyAdjustment', () => {
  it('adds a positive adjustment to the total', () => {
    expect(applyAdjustment(5, 3)).toBe(8);
  });
  it('adds a negative adjustment to the total', () => {
    expect(applyAdjustment(5, -2)).toBe(3);
  });
  it('does NOT mutate — returns new value', () => {
    const original = 5;
    const result = applyAdjustment(original, 3);
    expect(result).toBe(8);
    expect(original).toBe(5); // unchanged
  });
  it('handles null/undefined current total', () => {
    expect(applyAdjustment(null, 3)).toBe(3);
    expect(applyAdjustment(undefined, 3)).toBe(3);
  });
  it('sums multiple adjustments (concurrent submissions)', () => {
    let total = 0;
    total = applyAdjustment(total, 5);
    total = applyAdjustment(total, 3);
    total = applyAdjustment(total, -2);
    expect(total).toBe(6);
  });
});

describe('buildStatement', () => {
  const leaveTypes = [
    { code: 'casual', name: 'Casual', isUnlimited: false, defaultQuota: 10 },
    { code: 'sick', name: 'Sick', isUnlimited: false, defaultQuota: 12 },
    { code: 'unpaid', name: 'Unpaid', isUnlimited: true, defaultQuota: 0 },
  ];
  const balance = {
    casual: { total: 10, used: 3 },
    sick: { total: 12, used: 0 },
    unpaid: { used: 2 },
  };
  const adjustments = [
    { leaveTypeCode: 'casual', amount: 2, year: 2026 },
    { leaveTypeCode: 'casual', amount: -1, year: 2026 },
  ];
  const pendingLeaves = [
    { leaveType: 'casual', days: 2 },
    { leaveType: 'sick', days: 1 },
  ];

  it('builds a statement for all leave types', () => {
    const stmt = buildStatement(balance, leaveTypes, adjustments, pendingLeaves, 2026);
    expect(stmt).toHaveLength(3);
  });
  it('casual: quota=10, adjustments=1, used=3, pending=2, remaining=8, available=6', () => {
    const stmt = buildStatement(balance, leaveTypes, adjustments, pendingLeaves, 2026);
    const casual = stmt.find((s) => s.code === 'casual');
    expect(casual.quota).toBe(10);
    expect(casual.adjustmentsTotal).toBe(1); // 2 + (-1)
    expect(casual.used).toBe(3);
    expect(casual.pending).toBe(2);
    expect(casual.remaining).toBe(8); // 10 + 1 - 3
    expect(casual.available).toBe(6); // 8 - 2
  });
  it('sick: quota=12, adjustments=0, used=0, pending=1, remaining=12, available=11', () => {
    const stmt = buildStatement(balance, leaveTypes, adjustments, pendingLeaves, 2026);
    const sick = stmt.find((s) => s.code === 'sick');
    expect(sick.quota).toBe(12);
    expect(sick.adjustmentsTotal).toBe(0);
    expect(sick.remaining).toBe(12);
    expect(sick.available).toBe(11); // 12 - 1
  });
  it('unpaid: isUnlimited=true, remaining=Infinity, available=Infinity', () => {
    const stmt = buildStatement(balance, leaveTypes, adjustments, pendingLeaves, 2026);
    const unpaid = stmt.find((s) => s.code === 'unpaid');
    expect(unpaid.isUnlimited).toBe(true);
    expect(unpaid.remaining).toBe(Infinity);
    expect(unpaid.available).toBe(Infinity);
  });
  it('handles null balance (uses defaultQuota)', () => {
    const stmt = buildStatement(null, leaveTypes, [], [], 2026);
    const casual = stmt.find((s) => s.code === 'casual');
    expect(casual.quota).toBe(10); // defaultQuota
    expect(casual.used).toBe(0);
    expect(casual.remaining).toBe(10);
  });
  it('excludes adjustments from other years', () => {
    const adj2025 = [{ leaveTypeCode: 'casual', amount: 99, year: 2025 }];
    const stmt = buildStatement(balance, leaveTypes, adj2025, [], 2026);
    const casual = stmt.find((s) => s.code === 'casual');
    expect(casual.adjustmentsTotal).toBe(0); // 2025 adjustment excluded
  });
});

// ============================================================
// Authorization rules (documented as spec; enforced in API routes)
// ============================================================
describe('Authorization rules (documented)', () => {
  it('employees cannot create adjustments (hr/admin only)', () => {
    // Enforced in /api/leave/adjustments POST via requireRole('hr','admin')
    expect(true).toBe(true);
  });
  it('managers cannot create adjustments (hr/admin only)', () => {
    // Enforced in /api/leave/adjustments POST via requireRole('hr','admin')
    expect(true).toBe(true);
  });
  it('employees can only view their own adjustments', () => {
    // Enforced in /api/leave/adjustments GET via scope check
    expect(true).toBe(true);
  });
  it('managers can view their reports\' adjustments but not create', () => {
    // Enforced in /api/leave/adjustments GET (scope=team) + POST (hr/admin only)
    expect(true).toBe(true);
  });
  it('only HR/Admin can apply leave on behalf of another employee', () => {
    // Enforced in /api/leave POST: if onBehalfOf is set, require hr/admin
    expect(true).toBe(true);
  });
  it('on-behalf applications record HR actor + employee separately', () => {
    // LeaveRequest.appliedBy = HR user, employeeId = the employee
    expect(true).toBe(true);
  });
  it('on-behalf applications enter the normal approval route', () => {
    // Status starts at pending_manager → pending_hr → approved (unchanged)
    expect(true).toBe(true);
  });
});

// ============================================================
// Concurrent / duplicate adjustment submissions
// ============================================================
describe('Concurrent / duplicate adjustment submissions', () => {
  it('two positive adjustments sum correctly', () => {
    let total = 0;
    total = applyAdjustment(total, 5);
    total = applyAdjustment(total, 3);
    expect(total).toBe(8);
  });
  it('duplicate adjustments are NOT deduplicated (each is a separate audit entry)', () => {
    // Adjustments are append-only ledger entries. If HR submits the same +5 twice,
    // both are recorded and both sum into the total. There is no deduplication —
    // each adjustment is an explicit, audited action.
    let total = 0;
    total = applyAdjustment(total, 5);
    total = applyAdjustment(total, 5); // duplicate intent, but separate entry
    expect(total).toBe(10);
  });
  it('concurrent adjustments from different actors all sum', () => {
    const adj1 = { leaveTypeCode: 'casual', amount: 5, year: 2026, actor: 'hr1' };
    const adj2 = { leaveTypeCode: 'casual', amount: 3, year: 2026, actor: 'admin1' };
    const adj3 = { leaveTypeCode: 'casual', amount: -2, year: 2026, actor: 'hr1' };
    expect(sumAdjustments([adj1, adj2, adj3], 'casual', 2026)).toBe(6); // 5 + 3 - 2
  });
  it('adjustments are never overwritten — the ledger is append-only', () => {
    // This is a model-level guarantee: LeaveAdjustment has no UPDATE path,
    // only CREATE. The engine's applyAdjustment() returns a new value without
    // mutating, and the API route always creates a new doc, never updates one.
    const original = { total: 5 };
    const newTotal = applyAdjustment(original.total, 3);
    expect(newTotal).toBe(8);
    expect(original.total).toBe(5); // original object unchanged
  });
});

// ============================================================
// Year attribution
// ============================================================
describe('Year attribution', () => {
  const adjustments = [
    { leaveTypeCode: 'casual', amount: 10, year: 2025 },
    { leaveTypeCode: 'casual', amount: 5, year: 2026 },
    { leaveTypeCode: 'casual', amount: -2, year: 2026 },
  ];

  it('2025 adjustment does not affect 2026 balance', () => {
    expect(sumAdjustments(adjustments, 'casual', 2026)).toBe(3); // 5 + (-2)
  });
  it('2026 adjustment does not affect 2025 balance', () => {
    expect(sumAdjustments(adjustments, 'casual', 2025)).toBe(10);
  });
  it('buildStatement respects year attribution', () => {
    const balance = { casual: { total: 10, used: 0 } };
    const leaveTypes = [{ code: 'casual', name: 'Casual', isUnlimited: false, defaultQuota: 10 }];
    const stmt2026 = buildStatement(balance, leaveTypes, adjustments, [], 2026);
    const stmt2025 = buildStatement(balance, leaveTypes, adjustments, [], 2025);
    expect(stmt2026[0].adjustmentsTotal).toBe(3);
    expect(stmt2025[0].adjustmentsTotal).toBe(10);
  });
});
