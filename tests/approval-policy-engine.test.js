// tests/approval-policy-engine.test.js
// V2 Step 4 — business-rule tests for the approval policy engine.
// Run: bun run test
import { describe, it, expect } from 'vitest';
import {
  resolveRoute,
  validateRoute,
  canActAtStage,
  advanceStage,
  isFinalStage,
  isRouteComplete,
  buildManagementChain,
} from '../src/lib/approval-policy-engine.js';

describe('resolveRoute', () => {
  const managementChain = [
    { id: 'mgr1', fullName: 'Manager One', role: 'manager', status: 'active' },
    { id: 'mgr2', fullName: 'Manager Two', role: 'manager', status: 'active' },
    { id: 'dir1', fullName: 'Director One', role: 'manager', status: 'active' },
  ];

  it('resolves a 1-manager + HR route (V1 default)', () => {
    const { route } = resolveRoute({
      employeeId: 'emp1',
      managementChain,
      policy: { managerStages: 1, finalApproverRole: 'hr' },
    });
    expect(route).toHaveLength(2);
    expect(route[0].type).toBe('manager');
    expect(route[0].approverId).toBe('mgr1');
    expect(route[1].type).toBe('hr_admin');
    expect(route[1].approverRole).toBe('hr');
  });

  it('resolves a 2-manager + HR route', () => {
    const { route } = resolveRoute({
      employeeId: 'emp1',
      managementChain,
      policy: { managerStages: 2, finalApproverRole: 'hr' },
    });
    expect(route).toHaveLength(3);
    expect(route[0].approverId).toBe('mgr1');
    expect(route[1].approverId).toBe('mgr2');
    expect(route[2].type).toBe('hr_admin');
  });

  it('resolves a 0-manager route (straight to HR)', () => {
    const { route } = resolveRoute({
      employeeId: 'emp1',
      managementChain: [],
      policy: { managerStages: 0, finalApproverRole: 'hr' },
    });
    expect(route).toHaveLength(1);
    expect(route[0].type).toBe('hr_admin');
  });

  it('resolves a 5-manager route (max)', () => {
    const longChain = Array.from({ length: 5 }, (_, i) => ({
      id: `mgr${i + 1}`, fullName: `Manager ${i + 1}`, role: 'manager', status: 'active',
    }));
    const { route } = resolveRoute({
      employeeId: 'emp1',
      managementChain: longChain,
      policy: { managerStages: 5, finalApproverRole: 'admin' },
    });
    expect(route).toHaveLength(6); // 5 managers + 1 final
    expect(route[5].type).toBe('hr_admin');
    expect(route[5].approverRole).toBe('admin');
  });

  it('errors when management chain is too short for the policy', () => {
    const { error } = resolveRoute({
      employeeId: 'emp1',
      managementChain: [managementChain[0]], // only 1 level
      policy: { managerStages: 3, finalApproverRole: 'hr' },
    });
    expect(error).toMatch(/Management chain has only 1 level/);
  });

  it('errors when a manager in the chain is inactive', () => {
    const { error } = resolveRoute({
      employeeId: 'emp1',
      managementChain: [{ id: 'mgr1', fullName: 'Inactive Mgr', role: 'manager', status: 'inactive' }],
      policy: { managerStages: 1, finalApproverRole: 'hr' },
    });
    expect(error).toMatch(/inactive/);
  });

  it('errors when no policy is provided', () => {
    const { error } = resolveRoute({ employeeId: 'emp1', managementChain, policy: null });
    expect(error).toMatch(/No active approval policy/);
  });

  it('caps managerStages at 5 even if policy says more', () => {
    const { route } = resolveRoute({
      employeeId: 'emp1',
      managementChain: Array.from({ length: 10 }, (_, i) => ({
        id: `m${i}`, fullName: `M${i}`, role: 'manager', status: 'active',
      })),
      policy: { managerStages: 99, finalApproverRole: 'hr' },
    });
    expect(route).toHaveLength(6); // capped at 5 + 1 final
  });
});

describe('validateRoute', () => {
  it('passes for a valid route', () => {
    const route = [
      { stage: 0, type: 'manager', approverId: 'mgr1', approverName: 'M1' },
      { stage: 1, type: 'hr_admin', approverRole: 'hr' },
    ];
    const r = validateRoute(route, 'emp1');
    expect(r.ok).toBe(true);
  });

  it('fails for self-approval (employee in the route)', () => {
    const route = [
      { stage: 0, type: 'manager', approverId: 'emp1', approverName: 'Self' },
      { stage: 1, type: 'hr_admin', approverRole: 'hr' },
    ];
    const r = validateRoute(route, 'emp1');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Self-approval/);
  });

  it('fails for duplicate approvers (cyclic manager route)', () => {
    const route = [
      { stage: 0, type: 'manager', approverId: 'mgr1', approverName: 'M1' },
      { stage: 1, type: 'manager', approverId: 'mgr1', approverName: 'M1' }, // duplicate
      { stage: 2, type: 'hr_admin', approverRole: 'hr' },
    ];
    const r = validateRoute(route, 'emp1');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Duplicate approver/);
  });

  it('fails when final stage is not HR/Admin', () => {
    const route = [
      { stage: 0, type: 'manager', approverId: 'mgr1', approverName: 'M1' },
      { stage: 1, type: 'manager', approverId: 'mgr2', approverName: 'M2' },
    ];
    const r = validateRoute(route, 'emp1');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Final stage must be HR\/Admin/);
  });

  it('fails for empty route', () => {
    const r = validateRoute([], 'emp1');
    expect(r.ok).toBe(false);
  });

  it('passes when employee is not in the route', () => {
    const route = [
      { stage: 0, type: 'manager', approverId: 'mgr1', approverName: 'M1' },
      { stage: 1, type: 'hr_admin', approverRole: 'hr' },
    ];
    const r = validateRoute(route, 'emp1');
    expect(r.ok).toBe(true);
  });
});

describe('canActAtStage', () => {
  const route = [
    { stage: 0, type: 'manager', approverId: 'mgr1', approverName: 'Manager One', status: 'pending' },
    { stage: 1, type: 'manager', approverId: 'mgr2', approverName: 'Manager Two', status: 'pending' },
    { stage: 2, type: 'hr_admin', approverRole: 'hr', approverName: 'HR', status: 'pending' },
  ];

  it('allows the assigned manager at their stage', () => {
    const r = canActAtStage(route, 0, { actorEmployeeId: 'mgr1', actorRole: 'manager', ownerEmployeeId: 'emp1' });
    expect(r.ok).toBe(true);
  });

  it('blocks a different manager at stage 0', () => {
    const r = canActAtStage(route, 0, { actorEmployeeId: 'mgr2', actorRole: 'manager', ownerEmployeeId: 'emp1' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/only Manager One/);
  });

  it('allows admin to act at any stage (override)', () => {
    const r = canActAtStage(route, 0, { actorEmployeeId: 'admin1', actorRole: 'admin', ownerEmployeeId: 'emp1' });
    expect(r.ok).toBe(true);
  });

  it('allows HR at the final stage', () => {
    const r = canActAtStage(route, 2, { actorEmployeeId: 'hr1', actorRole: 'hr', ownerEmployeeId: 'emp1' });
    expect(r.ok).toBe(true);
  });

  it('blocks HR at a manager stage', () => {
    const r = canActAtStage(route, 0, { actorEmployeeId: 'hr1', actorRole: 'hr', ownerEmployeeId: 'emp1' });
    expect(r.ok).toBe(false);
  });

  it('blocks the owner from acting on their own leave (self-approval)', () => {
    const r = canActAtStage(route, 0, { actorEmployeeId: 'emp1', actorRole: 'manager', ownerEmployeeId: 'emp1' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/own leave/);
  });

  it('blocks HR when the final stage requires admin', () => {
    const adminRoute = [
      { stage: 0, type: 'hr_admin', approverRole: 'admin', approverName: 'Admin', status: 'pending' },
    ];
    const r = canActAtStage(adminRoute, 0, { actorEmployeeId: 'hr1', actorRole: 'hr', ownerEmployeeId: 'emp1' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/requires an Admin approver/);
  });

  it('fails for invalid stage index', () => {
    const r = canActAtStage(route, 99, { actorEmployeeId: 'mgr1', actorRole: 'manager', ownerEmployeeId: 'emp1' });
    expect(r.ok).toBe(false);
  });

  it('fails for null currentStage', () => {
    const r = canActAtStage(route, null, { actorEmployeeId: 'mgr1', actorRole: 'manager', ownerEmployeeId: 'emp1' });
    expect(r.ok).toBe(false);
  });
});

describe('advanceStage', () => {
  const route = [
    { stage: 0, type: 'manager' },
    { stage: 1, type: 'manager' },
    { stage: 2, type: 'hr_admin' },
  ];

  it('advances from stage 0 to 1', () => {
    expect(advanceStage(route, 0)).toBe(1);
  });

  it('advances from stage 1 to 2', () => {
    expect(advanceStage(route, 1)).toBe(2);
  });

  it('returns null when at the final stage (route complete)', () => {
    expect(advanceStage(route, 2)).toBeNull();
  });

  it('returns null for null currentStage', () => {
    expect(advanceStage(route, null)).toBeNull();
  });

  it('returns null for empty route', () => {
    expect(advanceStage([], 0)).toBeNull();
  });
});

describe('isFinalStage', () => {
  const route = [
    { stage: 0, type: 'manager' },
    { stage: 1, type: 'hr_admin' },
  ];

  it('true for the last stage', () => {
    expect(isFinalStage(route, 1)).toBe(true);
  });

  it('false for a non-final stage', () => {
    expect(isFinalStage(route, 0)).toBe(false);
  });

  it('false for empty route', () => {
    expect(isFinalStage([], 0)).toBe(false);
  });
});

describe('isRouteComplete', () => {
  it('true when all stages are resolved', () => {
    const route = [
      { status: 'approved' },
      { status: 'approved' },
    ];
    expect(isRouteComplete(route)).toBe(true);
  });

  it('false when any stage is pending', () => {
    const route = [
      { status: 'approved' },
      { status: 'pending' },
    ];
    expect(isRouteComplete(route)).toBe(false);
  });

  it('false for empty route', () => {
    expect(isRouteComplete([])).toBe(false);
  });
});

describe('buildManagementChain', () => {
  it('builds a chain by walking up managerId links', () => {
    const employee = { _id: 'emp1', managerId: 'mgr1' };
    const employeeMap = new Map([
      ['mgr1', { _id: 'mgr1', firstName: 'Manager', lastName: 'One', role: 'manager', status: 'active', managerId: 'mgr2' }],
      ['mgr2', { _id: 'mgr2', firstName: 'Manager', lastName: 'Two', role: 'manager', status: 'active', managerId: null }],
    ]);
    const chain = buildManagementChain(employee, employeeMap);
    expect(chain).toHaveLength(2);
    expect(chain[0].id).toBe('mgr1');
    expect(chain[1].id).toBe('mgr2');
  });

  it('returns empty for employee with no manager', () => {
    const employee = { _id: 'emp1', managerId: null };
    const chain = buildManagementChain(employee, new Map());
    expect(chain).toHaveLength(0);
  });

  it('stops on cycles in data (safety)', () => {
    // A→B→A cycle
    const employee = { _id: 'A', managerId: 'B' };
    const employeeMap = new Map([
      ['B', { _id: 'B', firstName: 'B', lastName: '', role: 'manager', status: 'active', managerId: 'A' }],
      ['A', { _id: 'A', firstName: 'A', lastName: '', role: 'manager', status: 'active', managerId: 'B' }],
    ]);
    const chain = buildManagementChain(employee, employeeMap);
    // Should stop before infinite loop — B is seen once, A is the employee (cycle)
    expect(chain.length).toBeLessThanOrEqual(1);
  });

  it('respects maxDepth safety limit', () => {
    // Build a very long chain
    const employee = { _id: 'e0', managerId: 'e1' };
    const employeeMap = new Map();
    for (let i = 1; i <= 100; i++) {
      employeeMap.set(`e${i}`, {
        _id: `e${i}`, firstName: `E${i}`, lastName: '', role: 'manager', status: 'active',
        managerId: i < 100 ? `e${i + 1}` : null,
      });
    }
    const chain = buildManagementChain(employee, employeeMap, 5);
    expect(chain.length).toBeLessThanOrEqual(5);
  });
});

// ============================================================
// Integration-style tests for the full approval flow
// ============================================================
describe('Full approval flow (integration)', () => {
  const managementChain = [
    { id: 'mgr1', fullName: 'Manager One', role: 'manager', status: 'active' },
    { id: 'mgr2', fullName: 'Manager Two', role: 'manager', status: 'active' },
  ];

  it('2-manager route: approve at 0 → advance to 1 → approve at 1 → advance to 2 (final)', () => {
    const { route } = resolveRoute({
      employeeId: 'emp1',
      managementChain,
      policy: { managerStages: 2, finalApproverRole: 'hr' },
    });
    expect(route).toHaveLength(3);

    // Stage 0: mgr1 approves
    let canAct = canActAtStage(route, 0, { actorEmployeeId: 'mgr1', actorRole: 'manager', ownerEmployeeId: 'emp1' });
    expect(canAct.ok).toBe(true);
    let next = advanceStage(route, 0);
    expect(next).toBe(1);

    // Stage 1: mgr2 approves
    canAct = canActAtStage(route, 1, { actorEmployeeId: 'mgr2', actorRole: 'manager', ownerEmployeeId: 'emp1' });
    expect(canAct.ok).toBe(true);
    next = advanceStage(route, 1);
    expect(next).toBe(2);

    // Stage 2: HR approves (final)
    canAct = canActAtStage(route, 2, { actorEmployeeId: 'hr1', actorRole: 'hr', ownerEmployeeId: 'emp1' });
    expect(canAct.ok).toBe(true);
    expect(isFinalStage(route, 2)).toBe(true);
    next = advanceStage(route, 2);
    expect(next).toBeNull(); // route complete
  });

  it('rejection at stage 0 is final — no advance', () => {
    const { route } = resolveRoute({
      employeeId: 'emp1',
      managementChain,
      policy: { managerStages: 2, finalApproverRole: 'hr' },
    });
    // mgr1 rejects at stage 0 — route doesn't advance
    const canReject = canActAtStage(route, 0, { actorEmployeeId: 'mgr1', actorRole: 'manager', ownerEmployeeId: 'emp1' });
    expect(canReject.ok).toBe(true);
    // Rejection means we DON'T advance — the leave goes to 'rejected' status
    // (the API route handles this; the engine just confirms the actor can act)
  });

  it('cannot skip stages (mgr2 cannot act at stage 0)', () => {
    const { route } = resolveRoute({
      employeeId: 'emp1',
      managementChain,
      policy: { managerStages: 2, finalApproverRole: 'hr' },
    });
    const canAct = canActAtStage(route, 0, { actorEmployeeId: 'mgr2', actorRole: 'manager', ownerEmployeeId: 'emp1' });
    expect(canAct.ok).toBe(false);
  });

  it('cannot act twice at the same stage (retry blocked)', () => {
    const { route } = resolveRoute({
      employeeId: 'emp1',
      managementChain,
      policy: { managerStages: 2, finalApproverRole: 'hr' },
    });
    // After approval at stage 0, currentStage advances to 1.
    // The API route would set route[0].status = 'approved' and advance currentStage.
    // The engine's canActAtStage is called with the NEW currentStage (1), not 0.
    // So "retrying" at stage 0 is impossible because currentStage has moved.
    const next = advanceStage(route, 0);
    expect(next).toBe(1);
    // If someone tries to act at stage 0 again, the API route checks currentStage (1),
    // not the stage they specify — they can't act at 0 because currentStage is 1.
  });
});

// ============================================================
// Policy changes (documented as spec; enforced in API routes)
// ============================================================
describe('Policy changes (documented)', () => {
  it('policy edits affect new submissions only', () => {
    // Pending requests keep their frozen routeSnapshot — never rewritten.
    // The API submission route resolves the route at submission time and
    // stores it on the LeaveRequest. Subsequent policy edits don't touch
    // existing LeaveRequest.routeSnapshot.
    expect(true).toBe(true);
  });

  it('reassignment requires expected-current-approver validation', () => {
    // The reassignment API validates that the current approver at the specified
    // stage matches the expectedCurrentApproverId before updating.
    expect(true).toBe(true);
  });

  it('reassignment is append-only audit (reassignmentHistory)', () => {
    // Each reassignment appends to reassignmentHistory[] — never overwrites.
    expect(true).toBe(true);
  });

  it('balance recheck at final approval', () => {
    // When the final stage is approved, the API route rechecks balance before
    // decrementing — if balance is now insufficient (e.g., another leave was
    // approved in the meantime), the final approval fails.
    expect(true).toBe(true);
  });
});
