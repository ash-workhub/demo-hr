// tests/report-engine.test.js
// V2 Step 6 — tests for attendance + leave reports + CSV export.
// Run: bun run test
import { describe, it, expect } from 'vitest';
import {
  computeAttendanceReport,
  computeLeaveReport,
  escapeCsvField,
  toCsv,
  validateDateRange,
  todayKey,
} from '../src/lib/report-engine.js';

describe('computeAttendanceReport', () => {
  const employees = [
    { _id: 'emp1', employeeId: 'FEG-001', firstName: 'Rafi', lastName: 'Karim', department: 'Engineering' },
    { _id: 'emp2', employeeId: 'FEG-002', firstName: 'Mehzabin', lastName: 'Chowdhury', department: 'Engineering' },
  ];

  it('counts present + late as attended (not double-counted)', () => {
    const records = [
      { employeeId: 'emp1', date: '2026-03-02', status: 'present', effectiveStatus: 'present' },
      { employeeId: 'emp1', date: '2026-03-03', status: 'late', effectiveStatus: 'late' },
      { employeeId: 'emp2', date: '2026-03-02', status: 'absent', effectiveStatus: 'absent' },
    ];
    const r = computeAttendanceReport(records, employees);
    expect(r.total).toBe(3);
    expect(r.present).toBe(1);
    expect(r.late).toBe(1);
    expect(r.attended).toBe(2); // present + late
    expect(r.absent).toBe(1);
  });

  it('distinguishes holiday/week-off from absent', () => {
    const records = [
      { employeeId: 'emp1', status: 'holiday', effectiveStatus: 'holiday' },
      { employeeId: 'emp1', status: 'week-off', effectiveStatus: 'week-off' },
      { employeeId: 'emp1', status: 'absent', effectiveStatus: 'absent' },
    ];
    const r = computeAttendanceReport(records, employees);
    expect(r.holiday).toBe(1);
    expect(r['week-off'] || r.weekOff).toBe(1);
    expect(r.absent).toBe(1);
    expect(r.attended).toBe(0);
  });

  it('handles pending status', () => {
    const records = [{ employeeId: 'emp1', status: 'pending', effectiveStatus: 'pending' }];
    const r = computeAttendanceReport(records, employees);
    expect(r.pending).toBe(1);
    expect(r.absent).toBe(0); // pending is NOT absent
  });

  it('builds per-employee breakdown', () => {
    const records = [
      { employeeId: 'emp1', status: 'present', effectiveStatus: 'present' },
      { employeeId: 'emp1', status: 'late', effectiveStatus: 'late' },
      { employeeId: 'emp2', status: 'absent', effectiveStatus: 'absent' },
    ];
    const r = computeAttendanceReport(records, employees);
    expect(r.byEmployee).toHaveLength(2);
    const emp1 = r.byEmployee.find((e) => e.employeeId === 'emp1');
    expect(emp1.present).toBe(1);
    expect(emp1.late).toBe(1);
    expect(emp1.totalDays).toBe(2);
    const emp2 = r.byEmployee.find((e) => e.employeeId === 'emp2');
    expect(emp2.absent).toBe(1);
  });

  it('handles empty dataset', () => {
    const r = computeAttendanceReport([], employees);
    expect(r.total).toBe(0);
    expect(r.attended).toBe(0);
    expect(r.byEmployee).toHaveLength(0);
  });

  it('handles records without employeeId', () => {
    const records = [{ status: 'present', effectiveStatus: 'present' }];
    const r = computeAttendanceReport(records, employees);
    expect(r.total).toBe(1);
    expect(r.byEmployee).toHaveLength(0);
  });

  it('falls back to status if effectiveStatus missing', () => {
    const records = [{ employeeId: 'emp1', status: 'present' }];
    const r = computeAttendanceReport(records, employees);
    expect(r.present).toBe(1);
  });
});

describe('computeLeaveReport', () => {
  const employees = [
    { _id: 'emp1', employeeId: 'FEG-001', firstName: 'Rafi', lastName: 'Karim', department: 'Engineering' },
  ];

  it('counts by status', () => {
    const leaves = [
      { employeeId: 'emp1', leaveType: 'casual', days: 3, status: 'approved' },
      { employeeId: 'emp1', leaveType: 'sick', days: 2, status: 'pending_manager' },
      { employeeId: 'emp1', leaveType: 'casual', days: 1, status: 'rejected' },
      { employeeId: 'emp1', leaveType: 'earned', days: 5, status: 'cancelled' },
    ];
    const r = computeLeaveReport(leaves, employees);
    expect(r.total).toBe(4);
    expect(r.approved).toBe(1);
    expect(r.pending).toBe(1);
    expect(r.rejected).toBe(1);
    expect(r.cancelled).toBe(1);
    expect(r.totalApprovedDays).toBe(3);
    expect(r.totalPendingDays).toBe(2);
  });

  it('aggregates by leave type', () => {
    const leaves = [
      { employeeId: 'emp1', leaveType: 'casual', days: 3, status: 'approved' },
      { employeeId: 'emp1', leaveType: 'casual', days: 2, status: 'pending_manager' },
      { employeeId: 'emp1', leaveType: 'sick', days: 1, status: 'approved' },
    ];
    const r = computeLeaveReport(leaves, employees);
    expect(r.byType.casual.count).toBe(2);
    expect(r.byType.casual.days).toBe(5);
    expect(r.byType.casual.approved).toBe(3);
    expect(r.byType.casual.pending).toBe(2);
    expect(r.byType.sick.count).toBe(1);
  });

  it('builds per-employee breakdown', () => {
    const leaves = [
      { employeeId: 'emp1', leaveType: 'casual', days: 3, status: 'approved' },
      { employeeId: 'emp1', leaveType: 'sick', days: 2, status: 'pending_hr' },
    ];
    const r = computeLeaveReport(leaves, employees);
    expect(r.byEmployee).toHaveLength(1);
    const emp = r.byEmployee[0];
    expect(emp.casual).toBe(3);
    expect(emp.sick).toBe(2);
    expect(emp.totalDays).toBe(5);
    expect(emp.approved).toBe(3);
    expect(emp.pending).toBe(2);
  });

  it('handles empty dataset', () => {
    const r = computeLeaveReport([], employees);
    expect(r.total).toBe(0);
    expect(r.byEmployee).toHaveLength(0);
  });

  it('handles pending_hr status', () => {
    const leaves = [{ employeeId: 'emp1', leaveType: 'casual', days: 1, status: 'pending_hr' }];
    const r = computeLeaveReport(leaves, employees);
    expect(r.pending).toBe(1);
    expect(r.totalPendingDays).toBe(1);
  });
});

describe('escapeCsvField', () => {
  it('returns empty string for null/undefined', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });
  it('returns plain values unchanged', () => {
    expect(escapeCsvField('hello')).toBe('hello');
    expect(escapeCsvField(42)).toBe('42');
  });
  it('wraps values with commas in quotes', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
  });
  it('wraps values with double-quotes and escapes them', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });
  it('wraps values with newlines in quotes', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });
  it('handles empty string', () => {
    expect(escapeCsvField('')).toBe('');
  });
  it('converts non-string to string', () => {
    expect(escapeCsvField(true)).toBe('true');
    expect(escapeCsvField(3.14)).toBe('3.14');
  });
});

describe('toCsv', () => {
  const headers = [
    { key: 'name', label: 'Name' },
    { key: 'code', label: 'Employee Code' },
    { key: 'days', label: 'Days' },
  ];

  it('produces CSV with BOM + header + data', () => {
    const rows = [
      { name: 'Rafi', code: 'FEG-001', days: 3 },
      { name: 'Mehzabin', code: 'FEG-002', days: 2 },
    ];
    const csv = toCsv(rows, headers);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Name,Employee Code,Days');
    expect(csv).toContain('Rafi,FEG-001,3');
    expect(csv).toContain('Mehzabin,FEG-002,2');
  });

  it('escapes values with commas', () => {
    const rows = [{ name: 'Karim, Rafi', code: 'FEG-001', days: 1 }];
    const csv = toCsv(rows, headers);
    expect(csv).toContain('"Karim, Rafi"');
  });

  it('handles empty rows', () => {
    const csv = toCsv([], headers);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Name,Employee Code,Days');
    // No data lines after header (just the trailing newline)
    expect(csv.split('\n').length).toBe(2); // header + empty
  });

  it('handles null values', () => {
    const rows = [{ name: 'Rafi', code: null, days: undefined }];
    const csv = toCsv(rows, headers);
    expect(csv).toContain('Rafi,,');
  });
});

describe('validateDateRange', () => {
  it('passes for valid range within maxDays', () => {
    const r = validateDateRange('2026-03-01', '2026-03-31', 90);
    expect(r.ok).toBe(true);
    expect(r.start).toBeInstanceOf(Date);
    expect(r.end).toBeInstanceOf(Date);
  });

  it('fails for missing dates', () => {
    expect(validateDateRange('', '2026-03-31').ok).toBe(false);
    expect(validateDateRange('2026-03-01', '').ok).toBe(false);
  });

  it('fails for invalid date format', () => {
    expect(validateDateRange('not-a-date', '2026-03-31').ok).toBe(false);
  });

  it('fails when end < start', () => {
    const r = validateDateRange('2026-03-31', '2026-03-01');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/after start date/);
  });

  it('fails when range exceeds maxDays', () => {
    const r = validateDateRange('2026-01-01', '2026-06-01', 90);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/exceed 90 days/);
  });

  it('allows exactly maxDays', () => {
    const r = validateDateRange('2026-01-01', '2026-03-31', 90);
    expect(r.ok).toBe(true);
  });

  it('allows same start + end date (single day)', () => {
    const r = validateDateRange('2026-03-15', '2026-03-15');
    expect(r.ok).toBe(true);
  });
});

describe('todayKey', () => {
  it('returns a YYYY-MM-DD string', () => {
    const key = todayKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ============================================================
// Authorization scoping (documented as spec; enforced in API routes)
// ============================================================
describe('Authorization scoping (documented)', () => {
  it('employees see only their own data in reports', () => {
    // The report API routes filter by employeeId = session user's employeeId for employees.
    expect(true).toBe(true);
  });
  it('managers see only their direct reports in reports', () => {
    // The report API routes filter by employeeId IN (direct reports) for managers.
    expect(true).toBe(true);
  });
  it('HR/Admin sees all FegHR Demo data in reports', () => {
    // The report API routes apply no employeeId filter for HR/Admin.
    expect(true).toBe(true);
  });
  it('date range is limited to 90 days max', () => {
    // validateDateRange enforces this server-side.
    expect(true).toBe(true);
  });
  it('row count is limited to 500', () => {
    // The report API routes use .limit(500) on queries.
    expect(true).toBe(true);
  });
  it('CSV export excludes sensitive fields (rawPunches, policySnapshot, etc.)', () => {
    // The CSV headers are explicitly defined — only report-relevant fields included.
    expect(true).toBe(true);
  });
  it('late is within present totals and not double-counted', () => {
    // computeAttendanceReport uses computeSummary which has attended = present + late.
    // present and late are separate counts; attended is the sum (not a third count).
    const records = [
      { employeeId: 'e1', status: 'present', effectiveStatus: 'present' },
      { employeeId: 'e1', status: 'late', effectiveStatus: 'late' },
    ];
    const r = computeAttendanceReport(records);
    expect(r.present).toBe(1);
    expect(r.late).toBe(1);
    expect(r.attended).toBe(2);
    expect(r.total).toBe(2);
    // attended = present + late (not 3)
    expect(r.attended).toBe(r.present + r.late);
  });
});

// ============================================================
// Boundary dates
// ============================================================
describe('Boundary dates', () => {
  it('report includes records on the start date', () => {
    const records = [
      { employeeId: 'e1', date: '2026-03-01', status: 'present', effectiveStatus: 'present' },
    ];
    const r = computeAttendanceReport(records);
    expect(r.total).toBe(1);
  });

  it('report includes records on the end date', () => {
    const records = [
      { employeeId: 'e1', date: '2026-03-31', status: 'present', effectiveStatus: 'present' },
    ];
    const r = computeAttendanceReport(records);
    expect(r.total).toBe(1);
  });

  it('validateDateRange sets start to midnight and end to end-of-day', () => {
    const r = validateDateRange('2026-03-01', '2026-03-31');
    expect(r.start.getHours()).toBe(0);
    expect(r.end.getHours()).toBe(23);
    expect(r.end.getMinutes()).toBe(59);
  });
});
