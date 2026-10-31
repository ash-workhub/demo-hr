// tests/org-engine.test.js
// V2 Step 1 — business-rule tests for the org engine.
// Run: bun run test
import { describe, it, expect } from 'vitest';
import {
  detectManagerCycle,
  validateEffectiveDate,
  computePrevEndDate,
  checkDuplicateReference,
  validateReferenceStatuses,
} from '../src/lib/org-engine.js';

describe('detectManagerCycle', () => {
  // managerMap: employeeId → their managerId
  const managerMap = new Map([
    ['emp1', 'mgr1'],   // emp1 reports to mgr1
    ['emp2', 'mgr1'],   // emp2 reports to mgr1
    ['mgr1', null],     // mgr1 has no manager (top)
    ['mgr2', 'mgr1'],   // mgr2 reports to mgr1
    ['emp3', 'mgr2'],
  ]);

  it('blocks self-manager (employee === newManager)', () => {
    const r = detectManagerCycle('emp1', 'emp1', managerMap);
    expect(r.hasCycle).toBe(true);
    expect(r.reason).toMatch(/own manager/);
  });

  it('allows a non-cyclical assignment', () => {
    // Setting emp3 as emp1's manager: walk up from emp3 → mgr2 → mgr1 → null. Never hits emp1.
    const r = detectManagerCycle('emp1', 'emp3', managerMap);
    expect(r.hasCycle).toBe(false);
  });

  it('detects a direct cycle (mgr1 → emp1 → mgr1)', () => {
    // If we set emp1 as mgr1's manager: walk up from emp1 → mgr1 (current). We're checking if
    // setting mgr1.managerId = emp1 creates a cycle. Walk from emp1 upward: emp1→mgr1.
    // We're looking for whether the new manager (emp1) eventually reports back to mgr1.
    // Actually: the function checks if walking up from newManagerId reaches employeeId.
    // Setting mgr1.managerId = emp1: newManager=emp1, walk up from emp1 → mgr1 (current, before the change).
    // Hmm, the map reflects CURRENT state. Let me test the case where the cycle would form.
    // Setting emp1.managerId = emp3: walk up from emp3 → mgr2 → mgr1 → null. emp1 not in chain. OK.
    // Setting mgr1.managerId = emp1: walk up from emp1 → mgr1. We reach mgr1 (the employee). CYCLE.
    const r = detectManagerCycle('mgr1', 'emp1', managerMap);
    expect(r.hasCycle).toBe(true);
    expect(r.chain).toContain('mgr1');
  });

  it('detects an indirect cycle (3-level)', () => {
    // Build a chain: A→B→C. Setting C.managerId = A should cycle.
    const map = new Map([
      ['A', 'B'],
      ['B', 'C'],
      ['C', null],
    ]);
    // Setting C.managerId = A: walk up from A → B → C (the employee). CYCLE.
    const r = detectManagerCycle('C', 'A', map);
    expect(r.hasCycle).toBe(true);
  });

  it('allows assignment to a top-level manager', () => {
    // emp1 → mgr1 (top). Setting mgr1 as emp2's manager: walk up from mgr1 → null. OK.
    const r = detectManagerCycle('emp2', 'mgr1', managerMap);
    expect(r.hasCycle).toBe(false);
  });

  it('handles null newManagerId (no cycle possible)', () => {
    const r = detectManagerCycle('emp1', null, managerMap);
    expect(r.hasCycle).toBe(false);
  });

  it('handles null employeeId', () => {
    const r = detectManagerCycle(null, 'mgr1', managerMap);
    expect(r.hasCycle).toBe(false);
  });

  it('bails out safely on pre-existing cycles in data', () => {
    // Corrupted data: A→B→A (already a cycle).
    const map = new Map([
      ['A', 'B'],
      ['B', 'A'],
    ]);
    // Setting B.managerId = A: walk from A → B (the employee). Cycle detected.
    const r = detectManagerCycle('B', 'A', map);
    expect(r.hasCycle).toBe(true);
    // The function detects the cycle (either as a new cycle or pre-existing).
    expect(r.reason).toMatch(/cycle/i);
  });

  it('respects maxDepth safety limit', () => {
    // Build a long non-cyclical chain longer than maxDepth.
    const map = new Map();
    for (let i = 0; i < 200; i++) map.set(`e${i}`, `e${i + 1}`);
    map.set('e200', null);
    // Setting e0.managerId = e150: walk from e150 up to e200 → null. Should complete within maxDepth.
    const r = detectManagerCycle('e0', 'e150', map, 100);
    expect(r.hasCycle).toBe(false);
  });
});

describe('validateEffectiveDate', () => {
  it('allows a valid date on or after joinDate', () => {
    const r = validateEffectiveDate('2026-06-01', '2026-01-01', null);
    expect(r.ok).toBe(true);
  });

  it('allows a future date (planned move)', () => {
    const r = validateEffectiveDate('2030-01-01', '2026-01-01', null);
    expect(r.ok).toBe(true);
  });

  it('rejects an invalid date string', () => {
    const r = validateEffectiveDate('not-a-date', '2026-01-01', null);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Invalid effective date/);
  });

  it('rejects a date before joinDate', () => {
    const r = validateEffectiveDate('2025-12-31', '2026-01-01', null);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/before the employee's join date/);
  });

  it('allows effectiveDate == joinDate (same-day initial assignment)', () => {
    const r = validateEffectiveDate('2026-01-01', '2026-01-01', null);
    expect(r.ok).toBe(true);
  });

  it('rejects a date before the previous assignment effectiveDate', () => {
    const r = validateEffectiveDate('2026-03-01', '2026-01-01', '2026-06-01');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/before the previous assignment/);
  });

  it('allows a date on or after the previous assignment effectiveDate', () => {
    const r = validateEffectiveDate('2026-06-01', '2026-01-01', '2026-06-01');
    expect(r.ok).toBe(true);
  });

  it('skips prevEffectiveDate check when null', () => {
    const r = validateEffectiveDate('2026-06-01', '2026-01-01', null);
    expect(r.ok).toBe(true);
  });

  it('skips joinDate check when null', () => {
    const r = validateEffectiveDate('2026-06-01', null, null);
    expect(r.ok).toBe(true);
  });
});

describe('computePrevEndDate', () => {
  it('returns the day before the new effectiveDate', () => {
    const r = computePrevEndDate('2026-06-01');
    expect(r).toBeInstanceOf(Date);
    expect(r.toISOString().slice(0, 10)).toBe('2026-05-31');
  });

  it('handles month-boundary (Jan 1 → Dec 31)', () => {
    const r = computePrevEndDate('2026-01-01');
    expect(r.toISOString().slice(0, 10)).toBe('2025-12-31');
  });

  it('normalizes to midnight', () => {
    const r = computePrevEndDate('2026-06-01T15:30:00');
    expect(r.getHours()).toBe(0);
    expect(r.getMinutes()).toBe(0);
  });
});

describe('checkDuplicateReference', () => {
  const existing = [
    { _id: 'abc', code: 'ENG', name: 'Engineering' },
    { _id: 'def', code: 'SAL', name: 'Sales' },
    { _id: 'ghi', code: 'OPS', name: 'Operations' },
  ];

  it('detects a duplicate code (case-insensitive)', () => {
    const r = checkDuplicateReference(existing, 'eng', 'New Dept');
    expect(r.hasDuplicate).toBe(true);
    expect(r.field).toBe('code');
  });

  it('detects a duplicate name', () => {
    const r = checkDuplicateReference(existing, 'NEW', 'Engineering');
    expect(r.hasDuplicate).toBe(true);
    expect(r.field).toBe('name');
  });

  it('allows a unique code + name', () => {
    const r = checkDuplicateReference(existing, 'FIN', 'Finance');
    expect(r.hasDuplicate).toBe(false);
  });

  it('excludes the record being edited (by _id)', () => {
    // Editing the 'Engineering' record itself — should not flag its own code/name.
    const r = checkDuplicateReference(existing, 'ENG', 'Engineering', 'abc');
    expect(r.hasDuplicate).toBe(false);
  });

  it('detects duplicate even when excluding a different record', () => {
    // Trying to use 'ENG' code while editing 'def' — should still flag.
    const r = checkDuplicateReference(existing, 'ENG', 'New Name', 'def');
    expect(r.hasDuplicate).toBe(true);
    expect(r.field).toBe('code');
  });

  it('handles empty existing list', () => {
    const r = checkDuplicateReference([], 'ENG', 'Engineering');
    expect(r.hasDuplicate).toBe(false);
  });

  it('handles whitespace in name', () => {
    const r = checkDuplicateReference(existing, 'NEW', '  Engineering  ');
    expect(r.hasDuplicate).toBe(true);
    expect(r.field).toBe('name');
  });
});

describe('validateReferenceStatuses', () => {
  it('passes when all refs are active', () => {
    const r = validateReferenceStatuses({
      branch: { status: 'active', name: 'Dhaka HQ' },
      department: { status: 'active', name: 'Engineering' },
      designation: { status: 'active', name: 'Engineer' },
    });
    expect(r.ok).toBe(true);
    expect(Object.keys(r.errors)).toHaveLength(0);
  });

  it('fails when a ref is inactive', () => {
    const r = validateReferenceStatuses({
      branch: { status: 'active', name: 'Dhaka HQ' },
      department: { status: 'inactive', name: 'Old Dept' },
      designation: { status: 'active', name: 'Engineer' },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.departmentId).toMatch(/inactive/);
  });

  it('fails when a ref is not found (null)', () => {
    const r = validateReferenceStatuses({
      branch: null,
      department: { status: 'active', name: 'Engineering' },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.branchId).toMatch(/not found/);
  });

  it('skips refs that are undefined (not provided)', () => {
    const r = validateReferenceStatuses({
      department: { status: 'active', name: 'Engineering' },
      // branch and designation not provided
    });
    expect(r.ok).toBe(true);
  });

  it('returns multiple errors when multiple refs are bad', () => {
    const r = validateReferenceStatuses({
      branch: null,
      department: { status: 'inactive', name: 'Old' },
      designation: null,
    });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors)).toHaveLength(3);
  });
});
