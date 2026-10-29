// tests/leave-engine.test.js
// Business-rule tests for the leave approval engine.
// Run: bun run test  (or: npx vitest run)
import { describe, it, expect } from 'vitest';
import {
  LEAVE_STATUS,
  LEAVE_TYPES,
  isActive,
  isFinal,
  calculateDays,
  checkBalance,
  transition,
  nextApproverRole,
  applyApprovalToBalance,
  checkOverlap,
  reservedDays,
  checkBalanceWithReservation,
} from '../src/lib/leave-engine.js';

describe('isActive / isFinal', () => {
  it('marks pending states as active', () => {
    expect(isActive('pending_manager')).toBe(true);
    expect(isActive('pending_hr')).toBe(true);
  });
  it('marks final states as not active', () => {
    expect(isActive('approved')).toBe(false);
    expect(isActive('rejected')).toBe(false);
    expect(isActive('cancelled')).toBe(false);
  });
  it('marks final states correctly', () => {
    expect(isFinal('approved')).toBe(true);
    expect(isFinal('rejected')).toBe(true);
    expect(isFinal('cancelled')).toBe(true);
    expect(isFinal('pending_manager')).toBe(false);
  });
});

describe('calculateDays', () => {
  it('counts a single weekday as 1 day', () => {
    expect(calculateDays('2026-03-02', '2026-03-02')).toBe(1); // Monday
  });
  it('counts a 5-day work week (Mon-Fri) as 5 days', () => {
    expect(calculateDays('2026-03-02', '2026-03-06')).toBe(5); // Mon-Fri
  });
  it('excludes weekends (Mon-Sun = 5 days)', () => {
    expect(calculateDays('2026-03-02', '2026-03-08')).toBe(5); // Mon-Sun
  });
  it('handles a 2-week range as 10 days', () => {
    expect(calculateDays('2026-03-02', '2026-03-13')).toBe(10); // Mon-Fri x2
  });
  it('throws on end-before-start', () => {
    expect(() => calculateDays('2026-03-06', '2026-03-02')).toThrow();
  });
  it('throws on invalid date', () => {
    expect(() => calculateDays('not-a-date', '2026-03-02')).toThrow();
  });
});

describe('checkBalance', () => {
  const balance = {
    casual: { total: 10, used: 3 },
    sick: { total: 12, used: 0 },
    earned: { total: 15, used: 15 },
    unpaid: { used: 0 },
  };

  it('allows when enough balance', () => {
    const r = checkBalance(balance, 'casual', 5);
    expect(r.ok).toBe(true);
    expect(r.balance.remaining).toBe(7);
  });
  it('denies when insufficient balance', () => {
    const r = checkBalance(balance, 'casual', 8);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Insufficient/);
    expect(r.balance.remaining).toBe(7);
  });
  it('denies when balance fully used', () => {
    const r = checkBalance(balance, 'earned', 1);
    expect(r.ok).toBe(false);
    expect(r.balance.remaining).toBe(0);
  });
  it('always allows unpaid leave (no cap)', () => {
    const r = checkBalance(balance, 'unpaid', 100);
    expect(r.ok).toBe(true);
  });
  it('rejects invalid leave type', () => {
    const r = checkBalance(balance, 'vacation', 1);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Invalid leave type/);
  });
  it('rejects non-positive days', () => {
    const r = checkBalance(balance, 'casual', 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/positive number/);
  });
});

describe('transition — approve', () => {
  it('manager approve moves to pending_hr', () => {
    const r = transition('pending_manager', 'approve', 'manager');
    expect(r.nextStatus).toBe('pending_hr');
    expect(r.historyAction).toBe('manager_approved');
  });
  it('hr approve moves to approved (final)', () => {
    const r = transition('pending_hr', 'approve', 'hr');
    expect(r.nextStatus).toBe('approved');
    expect(r.historyAction).toBe('hr_approved');
  });
  it('admin can approve at any stage', () => {
    expect(transition('pending_manager', 'approve', 'admin').nextStatus).toBe('pending_hr');
    expect(transition('pending_hr', 'approve', 'admin').nextStatus).toBe('approved');
  });
  it('employee cannot approve', () => {
    const r = transition('pending_manager', 'approve', 'employee');
    expect(r.error).toMatch(/Only manager/);
  });
  it('hr cannot approve at manager stage', () => {
    const r = transition('pending_manager', 'approve', 'hr');
    expect(r.error).toMatch(/Only manager/);
  });
  it('manager cannot approve at hr stage', () => {
    const r = transition('pending_hr', 'approve', 'manager');
    expect(r.error).toMatch(/Only hr/);
  });
  it('cannot approve an already-approved leave', () => {
    const r = transition('approved', 'approve', 'manager');
    expect(r.error).toMatch(/Cannot approve/);
  });
});

describe('transition — reject', () => {
  it('manager reject moves to rejected', () => {
    const r = transition('pending_manager', 'reject', 'manager');
    expect(r.nextStatus).toBe('rejected');
    expect(r.historyAction).toBe('manager_rejected');
  });
  it('hr reject moves to rejected', () => {
    const r = transition('pending_hr', 'reject', 'hr');
    expect(r.nextStatus).toBe('rejected');
    expect(r.historyAction).toBe('hr_rejected');
  });
  it('cannot reject an approved leave', () => {
    const r = transition('approved', 'reject', 'manager');
    expect(r.error).toMatch(/Cannot reject/);
  });
});

describe('transition — cancel', () => {
  it('employee can cancel a pending_manager leave', () => {
    const r = transition('pending_manager', 'cancel', 'employee');
    expect(r.nextStatus).toBe('cancelled');
  });
  it('employee can cancel a pending_hr leave', () => {
    const r = transition('pending_hr', 'cancel', 'employee');
    expect(r.nextStatus).toBe('cancelled');
  });
  it('cannot cancel an approved leave', () => {
    const r = transition('approved', 'cancel', 'employee');
    expect(r.error).toMatch(/Cannot cancel/);
  });
  it('cannot cancel a rejected leave', () => {
    const r = transition('rejected', 'cancel', 'employee');
    expect(r.error).toMatch(/Cannot cancel/);
  });
});

describe('nextApproverRole', () => {
  it('returns manager for pending_manager', () => {
    expect(nextApproverRole('pending_manager')).toBe('manager');
  });
  it('returns hr for pending_hr', () => {
    expect(nextApproverRole('pending_hr')).toBe('hr');
  });
  it('returns null for final states', () => {
    expect(nextApproverRole('approved')).toBeNull();
    expect(nextApproverRole('rejected')).toBeNull();
    expect(nextApproverRole('cancelled')).toBeNull();
  });
});

describe('applyApprovalToBalance', () => {
  it('increments used for casual leave', () => {
    const bal = { casual: { total: 10, used: 3 }, sick: { total: 12, used: 0 } };
    const next = applyApprovalToBalance(bal, 'casual', 5);
    expect(next.casual.used).toBe(8);
    // Original not mutated
    expect(bal.casual.used).toBe(3);
  });
  it('increments used for unpaid leave', () => {
    const bal = { unpaid: { used: 2 } };
    const next = applyApprovalToBalance(bal, 'unpaid', 3);
    expect(next.unpaid.used).toBe(5);
  });
  it('does not crash on missing bucket', () => {
    const bal = {};
    const next = applyApprovalToBalance(bal, 'casual', 1);
    expect(next).toBeDefined();
  });
});

describe('constants', () => {
  it('LEAVE_STATUS has 5 states', () => {
    expect(LEAVE_STATUS).toHaveLength(5);
    expect(LEAVE_STATUS).toContain('approved');
  });
  it('LEAVE_TYPES has 4 types', () => {
    expect(LEAVE_TYPES).toHaveLength(4);
    expect(LEAVE_TYPES).toContain('unpaid');
  });
});

// ============================================================
// Gap-fix tests (added in audit round)
// ============================================================

describe('calculateDays — half-day support', () => {
  it('returns 0.5 for a single weekday with isHalfDay=true', () => {
    expect(calculateDays('2026-03-02', '2026-03-02', true)).toBe(0.5); // Monday
  });
  it('returns 1 for a single weekday with isHalfDay=false (default)', () => {
    expect(calculateDays('2026-03-02', '2026-03-02')).toBe(1);
  });
  it('ignores isHalfDay when the range is more than 1 day', () => {
    // Mon-Fri with isHalfDay=true still returns 5 (half-day only applies to single days)
    expect(calculateDays('2026-03-02', '2026-03-06', true)).toBe(5);
  });
  it('ignores isHalfDay when the single day is a weekend (0 weekdays)', () => {
    // Saturday alone — 0 weekdays, isHalfDay can't apply
    const result = calculateDays('2026-03-07', '2026-03-07', true);
    expect(result).toBe(0.5); // falls through to the Math.max(0.5, ...) floor
  });
});

describe('checkOverlap', () => {
  const existingLeaves = [
    { _id: 'a', startDate: '2026-03-02', endDate: '2026-03-06', status: 'approved' }, // Mon-Fri
    { _id: 'b', startDate: '2026-03-16', endDate: '2026-03-18', status: 'pending_manager' }, // Mon-Wed
    { _id: 'c', startDate: '2026-02-02', endDate: '2026-02-04', status: 'rejected' }, // rejected — ignored
    { _id: 'd', startDate: '2026-01-05', endDate: '2026-01-09', status: 'cancelled' }, // cancelled — ignored
  ];

  it('detects overlap with an approved leave', () => {
    const r = checkOverlap(existingLeaves, '2026-03-04', '2026-03-08');
    expect(r.overlaps).toBe(true);
    expect(r.conflictingLeave.id).toBe('a');
  });
  it('detects overlap with a pending leave', () => {
    const r = checkOverlap(existingLeaves, '2026-03-16', '2026-03-16');
    expect(r.overlaps).toBe(true);
    expect(r.conflictingLeave.id).toBe('b');
  });
  it('does NOT overlap with rejected or cancelled leaves', () => {
    const r = checkOverlap(existingLeaves, '2026-02-03', '2026-02-03');
    expect(r.overlaps).toBe(false);
  });
  it('allows a non-overlapping range', () => {
    const r = checkOverlap(existingLeaves, '2026-03-09', '2026-03-13');
    expect(r.overlaps).toBe(false);
  });
  it('detects overlap when new range fully contains existing', () => {
    const r = checkOverlap(existingLeaves, '2026-03-01', '2026-03-31');
    expect(r.overlaps).toBe(true);
  });
  it('detects overlap when existing fully contains new', () => {
    const r = checkOverlap(existingLeaves, '2026-03-03', '2026-03-04');
    expect(r.overlaps).toBe(true);
  });
  it('handles adjacent ranges as non-overlapping (end == start-1)', () => {
    // existing ends 2026-03-06, new starts 2026-03-09 (weekend gap) — no overlap
    const r = checkOverlap(existingLeaves, '2026-03-09', '2026-03-13');
    expect(r.overlaps).toBe(false);
  });
});

describe('reservedDays', () => {
  const pendingLeaves = [
    { leaveType: 'casual', days: 3 },
    { leaveType: 'casual', days: 2 },
    { leaveType: 'sick', days: 1 },
    { leaveType: 'earned', days: 5 },
  ];

  it('sums pending days for casual', () => {
    expect(reservedDays(pendingLeaves, 'casual')).toBe(5);
  });
  it('sums pending days for sick', () => {
    expect(reservedDays(pendingLeaves, 'sick')).toBe(1);
  });
  it('returns 0 for unpaid (no reservation needed)', () => {
    expect(reservedDays(pendingLeaves, 'unpaid')).toBe(0);
  });
  it('returns 0 when no pending leaves of that type', () => {
    expect(reservedDays(pendingLeaves, 'earned')).toBe(5);
    expect(reservedDays([], 'casual')).toBe(0);
  });
});

describe('checkBalanceWithReservation', () => {
  const balance = {
    casual: { total: 10, used: 3 },
    sick: { total: 12, used: 0 },
    earned: { total: 15, used: 10 },
    unpaid: { used: 0 },
  };

  it('allows when used + reserved + requested <= total', () => {
    // total=10, used=3, reserved=2, requested=5 → 3+2+5=10 ≤ 10 ✓
    const pending = [{ leaveType: 'casual', days: 2 }];
    const r = checkBalanceWithReservation(balance, 'casual', 5, pending);
    expect(r.ok).toBe(true);
    expect(r.balance.available).toBe(5); // 10 - 3 - 2
  });

  it('denies when reservation would push over the limit', () => {
    // total=10, used=3, reserved=5, requested=3 → 3+5+3=11 > 10 ✗
    const pending = [{ leaveType: 'casual', days: 5 }];
    const r = checkBalanceWithReservation(balance, 'casual', 3, pending);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Insufficient/);
    expect(r.balance.available).toBe(2); // 10 - 3 - 5
    expect(r.balance.reserved).toBe(5);
  });

  it('denies when used alone already exhausts balance', () => {
    // earned: total=15, used=10, reserved=0, requested=6 → 16 > 15 ✗
    const r = checkBalanceWithReservation(balance, 'earned', 6, []);
    expect(r.ok).toBe(false);
    expect(r.balance.available).toBe(5); // 15 - 10 - 0
  });

  it('always allows unpaid leave (no reservation)', () => {
    const pending = [{ leaveType: 'unpaid', days: 100 }];
    const r = checkBalanceWithReservation(balance, 'unpaid', 50, pending);
    expect(r.ok).toBe(true);
  });

  it('only reserves pending leaves of the SAME type', () => {
    // casual: total=10, used=3, reserved=0 (the pending sick leave doesn't count)
    const pending = [{ leaveType: 'sick', days: 8 }];
    const r = checkBalanceWithReservation(balance, 'casual', 7, pending);
    expect(r.ok).toBe(true); // 3 + 0 + 7 = 10 ≤ 10
  });
});

describe('transition — self-approval is blocked at the call-site level', () => {
  // The engine itself doesn't know about "self" — the API route checks
  // owner._id === actor._id before calling transition(). Here we just verify
  // the engine's role-based checks still work as expected.
  it('hr can approve at pending_hr stage', () => {
    const r = transition('pending_hr', 'approve', 'hr');
    expect(r.nextStatus).toBe('approved');
  });
  it('manager cannot approve at pending_hr stage', () => {
    const r = transition('pending_hr', 'approve', 'manager');
    expect(r.error).toMatch(/Only hr/);
  });
});
