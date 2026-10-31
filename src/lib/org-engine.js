// src/lib/org-engine.js
// Pure functions for V2 Step 1 organization management.
// No DB, no React, no side effects — fully unit-testable with Vitest.
//
// Covers:
//   - Manager cycle detection (A→B→A is invalid)
//   - Effective-date validation for assignment transitions
//   - Reference-record active-status checks
//   - Duplicate code/name detection helpers

/**
 * Detects whether setting `newManagerId` as the manager of `employeeId` would
 * create a cycle in the manager chain. A cycle is: following managerId links
 * upward from newManagerId, we eventually arrive back at employeeId.
 *
 * @param {string} employeeId   - the employee whose manager is being set
 * @param {string} newManagerId - the proposed new manager
 * @param {Map<string, string|null>} managerMap - map of employeeId → their managerId (string|null)
 * @param {number} maxDepth - safety limit to prevent infinite loops (default 100)
 * @returns {{ hasCycle: boolean, chain?: string[], reason?: string }}
 */
export function detectManagerCycle(employeeId, newManagerId, managerMap, maxDepth = 100) {
  if (!employeeId || !newManagerId) return { hasCycle: false };
  if (employeeId === newManagerId) {
    return { hasCycle: true, chain: [employeeId], reason: 'Employee cannot be their own manager' };
  }

  // Walk up the chain from newManagerId. If we reach employeeId, it's a cycle.
  const chain = [newManagerId];
  let cursor = newManagerId;
  for (let i = 0; i < maxDepth; i++) {
    const next = managerMap.get(cursor);
    if (!next) break; // reached the top (no manager)
    if (next === employeeId) {
      chain.push(next);
      return {
        hasCycle: true,
        chain: [...chain, employeeId],
        reason: `Manager cycle detected: ${chain.join(' → ')} → ${employeeId}`,
      };
    }
    if (chain.includes(next)) {
      // Pre-existing cycle in the data — bail out safely.
      chain.push(next);
      return { hasCycle: true, chain, reason: `Pre-existing cycle in manager chain: ${chain.join(' → ')}` };
    }
    chain.push(next);
    cursor = next;
  }
  return { hasCycle: false, chain };
}

/**
 * Validates an effective date for a new assignment.
 * Rules:
 *   - effectiveDate must be a valid date
 *   - effectiveDate cannot be before the employee's joinDate
 *   - effectiveDate cannot be before the previous assignment's effectiveDate
 *     (assignments must be chronological)
 *   - Future dates ARE allowed (planned moves)
 *
 * @param {Date|string} effectiveDate
 * @param {Date|string|null} joinDate - employee's join date
 * @param {Date|string|null} prevEffectiveDate - the previous assignment's effectiveDate (if any)
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateEffectiveDate(effectiveDate, joinDate, prevEffectiveDate) {
  const eff = new Date(effectiveDate);
  if (isNaN(eff.getTime())) {
    return { ok: false, reason: 'Invalid effective date' };
  }
  // Normalize to midnight for date-only comparison.
  eff.setHours(0, 0, 0, 0);

  if (joinDate) {
    const jd = new Date(joinDate);
    jd.setHours(0, 0, 0, 0);
    if (eff < jd) {
      return {
        ok: false,
        reason: `Effective date cannot be before the employee's join date (${jd.toLocaleDateString('en-GB')})`,
      };
    }
  }

  if (prevEffectiveDate) {
    const prev = new Date(prevEffectiveDate);
    prev.setHours(0, 0, 0, 0);
    if (eff < prev) {
      return {
        ok: false,
        reason: `Effective date cannot be before the previous assignment's effective date (${prev.toLocaleDateString('en-GB')})`,
      };
    }
  }

  return { ok: true };
}

/**
 * Computes the endDate for the previous assignment when a new one is created.
 * The previous assignment's endDate = the day before the new effectiveDate.
 *
 * @param {Date|string} newEffectiveDate
 * @returns {Date} the endDate to set on the previous assignment (midnight)
 */
export function computePrevEndDate(newEffectiveDate) {
  const d = new Date(newEffectiveDate);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  return d;
}

/**
 * Checks whether a proposed code or name would be a duplicate within a company.
 * This is a pure helper — the actual uniqueness is enforced by a DB unique index,
 * but this gives a friendly pre-check error before hitting the index.
 *
 * @param {Array} existing - array of existing records with { code, name }
 * @param {string} code - proposed code (case-insensitive, will be uppercased)
 * @param {string} name - proposed name (case-sensitive)
 * @param {string|null} excludeId - if editing, the record's own _id (string) to exclude
 * @returns {{ hasDuplicate: boolean, field?: 'code'|'name', reason?: string }}
 */
export function checkDuplicateReference(existing, code, name, excludeId = null) {
  const upperCode = (code || '').toUpperCase().trim();
  const trimmedName = (name || '').trim();

  for (const rec of existing) {
    // Skip the record being edited.
    if (excludeId && rec._id && rec._id.toString() === excludeId) continue;

    if (rec.code && rec.code.toUpperCase() === upperCode) {
      return { hasDuplicate: true, field: 'code', reason: `Code '${upperCode}' already exists` };
    }
    if (rec.name && rec.name.trim() === trimmedName) {
      return { hasDuplicate: true, field: 'name', reason: `Name '${trimmedName}' already exists` };
    }
  }
  return { hasDuplicate: false };
}

/**
 * Validates that all provided reference IDs exist and are active.
 *
 * @param {object} refs - { branch?: {status}, department?: {status}, designation?: {status} }
 *   Each value is the looked-up reference record (or null if not found).
 * @returns {{ ok: boolean, errors: object }} errors is a { field: message } map
 */
export function validateReferenceStatuses(refs) {
  const errors = {};
  const fields = [
    { key: 'branch', label: 'Branch' },
    { key: 'department', label: 'Department' },
    { key: 'designation', label: 'Designation' },
  ];
  for (const f of fields) {
    const rec = refs[f.key];
    if (rec === undefined) continue; // not provided — skip
    if (rec === null) {
      errors[f.key + 'Id'] = `${f.label} not found`;
    } else if (rec.status && rec.status !== 'active') {
      errors[f.key + 'Id'] = `${f.label} '${rec.name}' is inactive — cannot assign`;
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}
