// src/lib/approval-policy-engine.js
// V2 Step 4 — pure functions for configurable sequential approval policies.
// No DB, no React, no side effects — fully unit-testable with Vitest.
//
// Route structure:
//   [stage 0..N-1]: manager stages (walking up the employee's management chain)
//   [stage N]:      final HR/Admin stage
//
// Rules:
//   - 0-5 manager stages + 1 final HR/Admin stage (always present)
//   - Route is resolved at submission and snapshotted (frozen) onto the LeaveRequest
//   - Only the assigned person at the current stage can decide
//   - Approval advances exactly one stage (no skipping)
//   - Rejection is final (no advance)
//   - Final approval rechecks balance
//   - No self-approval (owner can't be in the route)
//   - No duplicate approvers (same person can't appear twice)
//   - No cyclic manager route
//   - Policy edits affect new submissions only (pending requests keep their snapshot)

/**
 * Resolves the approval route for an employee given their management chain and the active policy.
 *
 * @param {object} params
 *   - employeeId: string (ObjectId hex)
 *   - managementChain: Array of { id, fullName, role, status } — walking up from direct manager.
 *       managementChain[0] = direct manager, [1] = manager's manager, etc.
 *   - policy: { managerStages: number (0-5), finalApproverRole: 'hr'|'admin' }
 * @returns {{ route: Array, error?: string }}
 *   route entry: { stage, type, approverId, approverName, status: 'pending' }
 */
export function resolveRoute({ employeeId, managementChain, policy }) {
  if (!policy) {
    return { error: 'No active approval policy' };
  }

  const managerStages = Math.min(5, Math.max(0, policy.managerStages || 0));
  const route = [];

  // Build manager stages by walking up the chain.
  for (let i = 0; i < managerStages; i++) {
    if (i >= managementChain.length) {
      return { error: `Management chain has only ${managementChain.length} level(s) but policy requires ${managerStages} manager stage(s)` };
    }
    const mgr = managementChain[i];
    if (!mgr) {
      return { error: `Missing manager at chain level ${i}` };
    }
    if (mgr.status && mgr.status !== 'active') {
      return { error: `Manager '${mgr.fullName}' at stage ${i} is inactive` };
    }
    route.push({
      stage: i,
      type: 'manager',
      approverId: mgr.id,
      approverName: mgr.fullName,
      status: 'pending',
    });
  }

  // Final HR/Admin stage (always present).
  route.push({
    stage: managerStages, // index after the manager stages
    type: 'hr_admin',
    approverRole: policy.finalApproverRole || 'hr',
    approverId: null, // role-based, not a specific person
    approverName: policy.finalApproverRole === 'admin' ? 'Admin' : 'HR',
    status: 'pending',
  });

  // Validate the resolved route.
  const validation = validateRoute(route, employeeId);
  if (validation.error) return { error: validation.error };

  return { route };
}

/**
 * Validates a resolved route.
 * Rules:
 *   - No self-approval: the employeeId must not appear as an approver
 *   - No duplicates: the same approverId can't appear in two manager stages
 *   - No cyclic manager route: if the employee appears in the chain, that's a cycle
 *   - Valid final approver: the last stage must be type 'hr_admin'
 *
 * @param {Array} route — the resolved route
 * @param {string} employeeId — the leave owner's employeeId
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateRoute(route, employeeId) {
  if (!route || route.length === 0) {
    return { ok: false, error: 'Route is empty' };
  }

  // Check final stage is HR/Admin.
  const lastStage = route[route.length - 1];
  if (lastStage.type !== 'hr_admin') {
    return { ok: false, error: 'Final stage must be HR/Admin' };
  }

  // Check no self-approval (manager stages only — HR/Admin has no specific approverId).
  const managerApproverIds = route
    .filter((s) => s.type === 'manager' && s.approverId)
    .map((s) => s.approverId);

  if (employeeId && managerApproverIds.includes(employeeId)) {
    return { ok: false, error: 'Self-approval detected: the employee appears as an approver in their own route' };
  }

  // Check no duplicates (same person in two manager stages).
  const uniqueIds = new Set(managerApproverIds);
  if (uniqueIds.size !== managerApproverIds.length) {
    return { ok: false, error: 'Duplicate approver detected: the same person appears in multiple manager stages (cyclic manager route)' };
  }

  return { ok: true };
}

/**
 * Checks whether the actor can act (approve/reject) at the current stage.
 *
 * For manager stages: the actor must be the assigned approverId at that stage
 *   (or admin). Self-approval is blocked (owner can't act on own leave).
 * For the final HR/Admin stage: the actor must have the matching role (or admin).
 *
 * @param {object} route — the frozen routeSnapshot
 * @param {number|null} currentStage — index into route
 * @param {object} params — { actorEmployeeId, actorRole, ownerEmployeeId }
 * @returns {{ ok: boolean, error?: string }}
 */
export function canActAtStage(route, currentStage, { actorEmployeeId, actorRole, ownerEmployeeId }) {
  if (!route || route.length === 0) {
    return { ok: false, error: 'No route snapshot on this request' };
  }
  if (currentStage === null || currentStage === undefined) {
    return { ok: false, error: 'No current stage set' };
  }
  if (currentStage < 0 || currentStage >= route.length) {
    return { ok: false, error: `Invalid stage index ${currentStage}` };
  }

  // Self-approval block: the owner cannot act on their own leave.
  if (ownerEmployeeId && actorEmployeeId && ownerEmployeeId === actorEmployeeId) {
    return { ok: false, error: 'Forbidden — you cannot approve or reject your own leave request' };
  }

  const stage = route[currentStage];

  if (stage.type === 'manager') {
    // Admin can always act (override).
    if (actorRole === 'admin') return { ok: true };
    // Otherwise, must be the assigned approver.
    if (!stage.approverId) {
      return { ok: false, error: 'No approver assigned at this stage' };
    }
    // Convert both to string for comparison (approverId may be a Mongoose ObjectId).
    const approverIdStr = stage.approverId.toString();
    if (actorEmployeeId !== approverIdStr) {
      return { ok: false, error: `Forbidden — only ${stage.approverName} (or admin) can act at stage ${currentStage}` };
    }
    return { ok: true };
  }

  if (stage.type === 'hr_admin') {
    // Admin can always act.
    if (actorRole === 'admin') return { ok: true };
    // HR can act if the stage's role is 'hr'.
    if (actorRole === 'hr' && stage.approverRole === 'hr') return { ok: true };
    // If the stage's role is 'admin', only admin can act (not HR).
    if (actorRole === 'hr' && stage.approverRole === 'admin') {
      return { ok: false, error: 'Forbidden — this stage requires an Admin approver' };
    }
    return { ok: false, error: `Forbidden — only ${stage.approverRole} (or admin) can act at the final stage` };
  }

  return { ok: false, error: `Unknown stage type: ${stage.type}` };
}

/**
 * Returns the next stage index after approval, or null if this was the final stage.
 * Approval advances EXACTLY one stage — no skipping.
 *
 * @param {Array} route
 * @param {number} currentStage
 * @returns {number|null} next stage index, or null if route is complete
 */
export function advanceStage(route, currentStage) {
  if (!route || currentStage === null || currentStage === undefined) return null;
  const next = currentStage + 1;
  if (next >= route.length) return null; // route complete
  return next;
}

/**
 * True if the given stage index is the final stage (last in the route).
 */
export function isFinalStage(route, stageIndex) {
  if (!route || route.length === 0) return false;
  return stageIndex === route.length - 1;
}

/**
 * True if all stages in the route are resolved (none pending).
 */
export function isRouteComplete(route) {
  if (!route || route.length === 0) return false;
  return route.every((s) => s.status !== 'pending');
}

/**
 * Builds a management chain by walking up from an employee's direct manager.
 * Returns an array of { id, fullName, role, status }.
 *
 * @param {object} employee — the leave owner's Employee doc
 * @param {Map} employeeMap — Map of employeeId -> Employee doc (for lookups)
 * @param {number} maxDepth — safety limit (default 10)
 * @returns {Array} management chain (index 0 = direct manager)
 */
export function buildManagementChain(employee, employeeMap, maxDepth = 10) {
  if (!employee || !employee.managerId) return [];

  const chain = [];
  let cursor = employee.managerId;
  // Include the employee's own ID in `seen` so a cycle back to the employee
  // (e.g., A→B→A) is detected immediately.
  const seen = new Set([employee._id.toString()]);

  for (let i = 0; i < maxDepth; i++) {
    const idStr = cursor.toString();
    if (seen.has(idStr)) break; // cycle in data — stop
    seen.add(idStr);

    const mgr = employeeMap.get(idStr);
    if (!mgr) break;

    chain.push({
      id: idStr,
      fullName: `${mgr.firstName} ${mgr.lastName}`,
      role: mgr.role,
      status: mgr.status,
    });

    if (!mgr.managerId) break; // reached top
    cursor = mgr.managerId;
  }

  return chain;
}
