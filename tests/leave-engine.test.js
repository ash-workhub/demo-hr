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
