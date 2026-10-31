// src/lib/payroll-engine.js
// V3 Step 1 — pure functions for payroll settings validation + authorization.
// No DB, no React, no side effects — fully unit-testable with Vitest.
//
// Boundary: this module defines WHO can access payroll and WHAT settings are valid.
// It does NOT contain compensation, formulas, taxes, bank details, or integrations.

/**
 * Determines whether a user role can manage payroll settings.
 * Only HR/Admin. Managers have NO salary access.
 *
 * @param {string} role — 'employee' | 'manager' | 'hr' | 'admin'
 * @returns {boolean}
 */
export function canManagePayroll(role) {
  return role === 'hr' || role === 'admin';
}

/**
 * Determines whether a user role can view payroll data.
 * Employees: only their own (locked) statement — NOT in this step.
 * Managers: NO access at all.
 * HR/Admin: full access.
 *
 * @param {string} role
 * @returns {boolean}
 */
export function canViewPayroll(role) {
  return role === 'hr' || role === 'admin';
}

/**
 * Validates a display currency label.
 * Must be a non-empty string, max 10 chars, uppercase letters only.
 *
 * @param {string} currency
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateDisplayCurrency(currency) {
  if (!currency || typeof currency !== 'string') {
    return { ok: false, error: 'Display currency is required' };
  }
  const trimmed = currency.trim().toUpperCase();
  if (trimmed.length === 0 || trimmed.length > 10) {
    return { ok: false, error: 'Currency must be 1-10 characters' };
  }
  if (!/^[A-Z]+$/.test(trimmed)) {
    return { ok: false, error: 'Currency must contain only letters (A-Z)' };
  }
  return { ok: true, value: trimmed };
}

/**
 * Returns a safe (non-sensitive) representation of payroll settings.
 * Currently just the display currency + flags — no salary data exists yet.
 *
 * @param {object} settings — PayrollSettings doc
 * @returns {object} safe representation
 */
export function toSafeSettings(settings) {
  if (!settings) return null;
  return {
    company: settings.company,
    displayCurrency: settings.displayCurrency,
    isDemoMode: settings.isDemoMode,
    enabled: settings.enabled,
    lastUpdatedByName: settings.lastUpdatedByName || '',
    updatedAt: settings.updatedAt,
  };
}
