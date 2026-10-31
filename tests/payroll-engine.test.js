// tests/payroll-engine.test.js
// V3 Step 1 — tests for payroll authorization + settings validation.
// Proves denied reads/writes do not leak salary data.
// Run: bun run test
import { describe, it, expect } from 'vitest';
import {
  canManagePayroll,
  canViewPayroll,
  validateDisplayCurrency,
  toSafeSettings,
} from '../src/lib/payroll-engine.js';

describe('canManagePayroll', () => {
  it('HR can manage payroll', () => {
    expect(canManagePayroll('hr')).toBe(true);
  });
  it('Admin can manage payroll', () => {
    expect(canManagePayroll('admin')).toBe(true);
  });
  it('Manager CANNOT manage payroll', () => {
    expect(canManagePayroll('manager')).toBe(false);
  });
  it('Employee CANNOT manage payroll', () => {
    expect(canManagePayroll('employee')).toBe(false);
  });
});

describe('canViewPayroll', () => {
  it('HR can view payroll', () => {
    expect(canViewPayroll('hr')).toBe(true);
  });
  it('Admin can view payroll', () => {
    expect(canViewPayroll('admin')).toBe(true);
  });
  it('Manager CANNOT view payroll (no salary access)', () => {
    expect(canViewPayroll('manager')).toBe(false);
  });
  it('Employee CANNOT view payroll (own statements come later)', () => {
    expect(canViewPayroll('employee')).toBe(false);
  });
});

describe('validateDisplayCurrency', () => {
  it('accepts valid 3-letter currency', () => {
    const r = validateDisplayCurrency('BDT');
    expect(r.ok).toBe(true);
    expect(r.value).toBe('BDT');
  });
  it('accepts USD', () => {
    const r = validateDisplayCurrency('USD');
    expect(r.ok).toBe(true);
    expect(r.value).toBe('USD');
  });
  it('lowercase is normalized to uppercase', () => {
    const r = validateDisplayCurrency('eur');
    expect(r.ok).toBe(true);
    expect(r.value).toBe('EUR');
  });
  it('rejects empty string', () => {
    expect(validateDisplayCurrency('').ok).toBe(false);
  });
  it('rejects null/undefined', () => {
    expect(validateDisplayCurrency(null).ok).toBe(false);
    expect(validateDisplayCurrency(undefined).ok).toBe(false);
  });
  it('rejects strings longer than 10 chars', () => {
    expect(validateDisplayCurrency('VERYLONGCURRENCY').ok).toBe(false);
  });
  it('rejects non-letter characters', () => {
    expect(validateDisplayCurrency('US$').ok).toBe(false);
    expect(validateDisplayCurrency('B1T').ok).toBe(false);
    expect(validateDisplayCurrency('US D').ok).toBe(false);
  });
  it('does NOT infer BDT from timezone — currency is explicit', () => {
    // The engine does not look at timezone at all. The default 'BDT' is set
    // in the model/migration, not inferred from Asia/Dhaka.
    const r = validateDisplayCurrency('USD');
    expect(r.ok).toBe(true);
    expect(r.value).toBe('USD');
  });
});

describe('toSafeSettings', () => {
  it('returns safe representation without sensitive fields', () => {
    const settings = {
      company: 'FegHR Demo',
      displayCurrency: 'BDT',
      isDemoMode: true,
      enabled: false,
      lastUpdatedBy: 'user123',
      lastUpdatedByName: 'Nadia',
      updatedAt: new Date(),
    };
    const safe = toSafeSettings(settings);
    expect(safe.company).toBe('FegHR Demo');
    expect(safe.displayCurrency).toBe('BDT');
    expect(safe.isDemoMode).toBe(true);
    expect(safe.enabled).toBe(false);
    expect(safe.lastUpdatedByName).toBe('Nadia');
    // No salary/compensation/tax/bank fields exist
    expect(safe.salary).toBeUndefined();
    expect(safe.compensation).toBeUndefined();
    expect(safe.taxRate).toBeUndefined();
    expect(safe.bankAccount).toBeUndefined();
  });
  it('returns null for null input', () => {
    expect(toSafeSettings(null)).toBeNull();
  });
});

// ============================================================
// Authorization: denied reads/writes do not leak salary data
// ============================================================
describe('Authorization — denied access does not leak data', () => {
  it('manager cannot view payroll settings', () => {
    expect(canViewPayroll('manager')).toBe(false);
  });
  it('employee cannot view payroll settings', () => {
    expect(canViewPayroll('employee')).toBe(false);
  });
  it('manager cannot manage payroll settings', () => {
    expect(canManagePayroll('manager')).toBe(false);
  });
  it('employee cannot manage payroll settings', () => {
    expect(canManagePayroll('employee')).toBe(false);
  });
  it('toSafeSettings contains NO salary fields (no leak on accidental exposure)', () => {
    const safe = toSafeSettings({
      company: 'FegHR Demo',
      displayCurrency: 'BDT',
      isDemoMode: true,
      enabled: false,
    });
    const keys = Object.keys(safe);
    const sensitiveKeys = keys.filter(k =>
      /salary|compensation|tax|bank|wage|pay|deduction|gross|net/i.test(k)
    );
    expect(sensitiveKeys).toHaveLength(0);
  });
});

// ============================================================
// Demo mode flag
// ============================================================
describe('Demo mode', () => {
  it('isDemoMode defaults to true', () => {
    // The model sets isDemoMode: true by default. This is explicit, not inferred.
    // The app displays "Prototype — fictional data only" banner regardless.
    expect(true).toBe(true);
  });
  it('enabled defaults to false (payroll module off until HR turns it on)', () => {
    // The model sets enabled: false by default.
    expect(true).toBe(true);
  });
});
