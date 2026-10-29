// src/lib/report-engine.js
// V2 Step 6 — pure functions for attendance + leave reports + CSV export.
// No DB, no React, no side effects — fully unit-testable with Vitest.
//
// Reuses V2 status priority from attendance-engine: Late is within Present
// (not double-counted). Holiday/week-off are distinguished from absent.

import { isAttended, computeSummary } from './attendance-engine.js';

/**
 * Computes an attendance report from raw attendance records.
 * Uses the V2 status priority: Late is within Present (attended = present + late).
 *
 * @param {Array} records — attendance docs with { employeeId, date, status, effectiveStatus, checkInTime, checkOutTime }
 * @param {Array} employees — employee docs for by-employee breakdown (optional)
 * @returns {object} { total, attended, present, late, absent, leave, holiday, weekOff, pending, halfDay, byEmployee }
 */
export function computeAttendanceReport(records, employees = []) {
  const summary = computeSummary(records.map((r) => ({
    effectiveStatus: r.effectiveStatus || r.status || 'pending',
  })));

  // Build per-employee breakdown.
  const empMap = new Map();
  for (const e of employees) {
    empMap.set(e._id.toString(), e);
  }

  const byEmployeeMap = new Map();
  for (const r of records) {
    const empId = r.employeeId?.toString();
    if (!empId) continue;
    if (!byEmployeeMap.has(empId)) {
      const emp = empMap.get(empId);
      byEmployeeMap.set(empId, {
        employeeId: empId,
        employeeCode: emp?.employeeId || '',
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown',
        department: emp?.department || '',
        present: 0, late: 0, absent: 0, leave: 0, holiday: 0, weekOff: 0, pending: 0, halfDay: 0,
        totalDays: 0,
      });
    }
    const entry = byEmployeeMap.get(empId);
    const status = r.effectiveStatus || r.status || 'pending';
    entry.totalDays++;
    if (entry[status] !== undefined) entry[status]++;
    // Ensure 'half-day' key is handled (hyphenated)
    if (status === 'half-day') entry.halfDay++;
  }

  return {
    ...summary,
    halfDay: summary['half-day'] || 0,
    byEmployee: Array.from(byEmployeeMap.values()),
  };
}

/**
 * Computes a leave report from raw leave request records.
 *
 * @param {Array} leaves — LeaveRequest docs with { employeeId, leaveType, days, status, startDate, endDate }
 * @param {Array} employees — employee docs for by-employee breakdown
 * @returns {object} { total, approved, pending, rejected, cancelled, byType, byEmployee }
 */
export function computeLeaveReport(leaves, employees = []) {
  const empMap = new Map();
  for (const e of employees) {
    empMap.set(e._id.toString(), e);
  }

  const summary = {
    total: leaves.length,
    approved: 0,
    pending: 0,
    rejected: 0,
    cancelled: 0,
    totalApprovedDays: 0,
    totalPendingDays: 0,
  };

  const byType = {};
  const byEmployeeMap = new Map();

  for (const l of leaves) {
    const status = l.status || 'pending';
    // Map V2 approval-chain statuses to summary buckets.
    if (status === 'approved') { summary.approved++; summary.totalApprovedDays += l.days || 0; }
    else if (status === 'pending_manager' || status === 'pending_hr') { summary.pending++; summary.totalPendingDays += l.days || 0; }
    else if (status === 'rejected') { summary.rejected++; }
    else if (status === 'cancelled') { summary.cancelled++; }

    // By type
    const type = l.leaveType || 'unknown';
    if (!byType[type]) byType[type] = { count: 0, days: 0, approved: 0, pending: 0 };
    byType[type].count++;
    byType[type].days += l.days || 0;
    if (status === 'approved') byType[type].approved += l.days || 0;
    if (status === 'pending_manager' || status === 'pending_hr') byType[type].pending += l.days || 0;

    // By employee
    const empId = l.employeeId?.toString();
    if (!empId) continue;
    if (!byEmployeeMap.has(empId)) {
      const emp = empMap.get(empId);
      byEmployeeMap.set(empId, {
        employeeId: empId,
        employeeCode: emp?.employeeId || '',
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown',
        department: emp?.department || '',
        casual: 0, sick: 0, earned: 0, unpaid: 0,
        totalDays: 0, approved: 0, pending: 0, rejected: 0,
      });
    }
    const entry = byEmployeeMap.get(empId);
    if (entry[l.leaveType] !== undefined) entry[l.leaveType] += l.days || 0;
    entry.totalDays += l.days || 0;
    if (status === 'approved') entry.approved += l.days || 0;
    else if (status === 'pending_manager' || status === 'pending_hr') entry.pending += l.days || 0;
    else if (status === 'rejected') entry.rejected += l.days || 0;
  }

  return {
    ...summary,
    byType,
    byEmployee: Array.from(byEmployeeMap.values()),
  };
}

/**
 * Escapes a single CSV field value.
 * Rules per RFC 4180:
 *   - If the value contains a comma, double-quote, or newline, wrap in double-quotes
 *   - Escape internal double-quotes by doubling them
 *   - null/undefined → empty string
 *
 * @param {*} value
 * @returns {string}
 */
export function escapeCsvField(value) {
  if (value === null || value === undefined) return '';
  let str = String(value);
  // If the value contains special characters, wrap in quotes + escape internal quotes.
  if (/[",\n\r]/.test(str)) {
    str = '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Converts an array of objects to a CSV string.
 *
 * @param {Array} rows — array of objects
 * @param {Array} headers — array of { key, label } (label is the CSV column header)
 * @returns {string} CSV string (with UTF-8 BOM prefix for Excel)
 */
export function toCsv(rows, headers) {
  const BOM = '\uFEFF';
  const headerLine = headers.map((h) => escapeCsvField(h.label)).join(',');
  if (rows.length === 0) {
    return BOM + headerLine + '\n';
  }
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCsvField(row[h.key])).join(',')
  );
  return BOM + headerLine + '\n' + dataLines.join('\n') + '\n';
}

/**
 * Validates a date range for report queries.
 * Rules:
 *   - Both dates must be valid
 *   - End date must be >= start date
 *   - Range must not exceed maxDays (default 90)
 *
 * @param {string} startDate — YYYY-MM-DD
 * @param {string} endDate — YYYY-MM-DD
 * @param {number} maxDays — default 90
 * @returns {{ ok: boolean, error?: string, start?: Date, end?: Date }}
 */
export function validateDateRange(startDate, endDate, maxDays = 90) {
  if (!startDate || !endDate) {
    return { ok: false, error: 'Both startDate and endDate are required' };
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { ok: false, error: 'Invalid date format (use YYYY-MM-DD)' };
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  if (end < start) {
    return { ok: false, error: 'End date must be on or after start date' };
  }

  const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  if (diffDays > maxDays) {
    return { ok: false, error: `Date range must not exceed ${maxDays} days (requested ${diffDays} days)` };
  }

  return { ok: true, start, end };
}

/**
 * Returns today's date key in YYYY-MM-DD format (Asia/Dhaka).
 */
export function todayKey(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
}
