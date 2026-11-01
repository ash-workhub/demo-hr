// src/app/api/payroll/runs/[id]/lines/[employeeId]/route.js
// GET /api/payroll/runs/:id/lines/:employeeId — get a single employee's line from a run.
//
// V3 Step 5 — employee self-view of own locked line.
// HR/Admin: can view any employee's line in any run (draft or locked).
// Employee: can view ONLY their own line, AND only when the run is locked.
//   Drafts are NOT exposed to employees.
// Manager: NO access at all (no salary access).
//
// Every employee response includes the label:
//   "Fictional payroll preview — not a payslip or proof of payment"
import { connectDB, PayrollRun } from '@/lib/db/index.js';
import { requireUser, getSessionEmployee } from '@/lib/auth-helpers.js';
import { formatMoney } from '@/lib/compensation-engine.js';

const FICTIONAL_LABEL = 'Fictional payroll preview — not a payslip or proof of payment';

function toEmployeeSafeLine(line, run) {
  const currency = run.displayCurrency || 'BDT';
  return {
    _fictionalLabel: FICTIONAL_LABEL,
    runYear: run.year,
    runMonth: run.month,
    runStatus: run.status,
    displayCurrency: currency,
    employeeCode: line.employeeCode,
    employeeName: line.employeeName,
    department: line.department,
    designation: line.designation,
    basePay: line.basePay,
    basePayDisplay: formatMoney(line.basePay, currency),
    allowances: (line.allowances || []).map((a) => ({
      name: a.name,
      amount: a.amount,
      amountDisplay: formatMoney(a.amount, currency),
    })),
    grossPay: line.grossPay,
    grossPayDisplay: formatMoney(line.grossPay, currency),
    illustrativeGross: line.illustrativeGross,
    illustrativeGrossDisplay: formatMoney(line.illustrativeGross, currency),
    calcMode: line.calcMode,
    calendarDays: line.calendarDays,
    payableDays: line.payableDays,
    absentDays: line.absentDays,
    unpaidLeaveDays: line.unpaidLeaveDays,
    paidLeaveDays: line.paidLeaveDays,
    ambiguousDays: line.ambiguousDays,
    limitations: line.limitations || [],
    lockedAt: run.lockedAt,
    lockedByName: run.lockedByName,
  };
}

function toHRAdminSafeLine(line, run) {
  const currency = run.displayCurrency || 'BDT';
  return {
    _fictionalLabel: FICTIONAL_LABEL,
    runId: run._id.toString(),
    runYear: run.year,
    runMonth: run.month,
    runStatus: run.status,
    displayCurrency: currency,
    employeeId: line.employeeId?.toString(),
    employeeCode: line.employeeCode,
    employeeName: line.employeeName,
    department: line.department,
    designation: line.designation,
    basePay: line.basePay,
    basePayDisplay: formatMoney(line.basePay, currency),
    allowances: (line.allowances || []).map((a) => ({
      name: a.name,
      amount: a.amount,
      amountDisplay: formatMoney(a.amount, currency),
    })),
    grossPay: line.grossPay,
    grossPayDisplay: formatMoney(line.grossPay, currency),
    compensationEffectiveDate: line.compensationEffectiveDate,
    calcMode: line.calcMode,
    calcVersion: line.calcVersion,
    calendarDays: line.calendarDays,
    payableDays: line.payableDays,
    absentDays: line.absentDays,
    unpaidLeaveDays: line.unpaidLeaveDays,
    paidLeaveDays: line.paidLeaveDays,
    ambiguousDays: line.ambiguousDays,
    illustrativeGross: line.illustrativeGross,
    illustrativeGrossDisplay: formatMoney(line.illustrativeGross, currency),
    generatedByName: line.generatedByName,
    generatedAt: line.generatedAt,
    lockedAt: run.lockedAt,
    lockedByName: run.lockedByName,
    limitations: line.limitations || [],
  };
}

export async function GET(request, { params }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, employeeId } = await params;
  await connectDB();

  // Managers: NO access at all.
  if (user.role === 'manager') {
    return Response.json(
      { error: 'Forbidden — managers have no payroll access' },
      { status: 403 }
    );
  }

  // Load the run.
  const run = await PayrollRun.findById(id).lean();
  if (!run) return Response.json({ error: 'Run not found' }, { status: 404 });

  // Find the employee's line.
  const line = (run.lines || []).find(
    (l) => l.employeeId?.toString() === employeeId
  );
  if (!line) return Response.json({ error: 'Line not found for this employee' }, { status: 404 });

  // HR/Admin: can view any employee's line in any run (draft or locked).
  if (user.role === 'hr' || user.role === 'admin') {
    return Response.json(toHRAdminSafeLine(line, run));
  }

  // Employee: can view ONLY their own line, AND only when the run is locked.
  // Drafts are NOT exposed to employees.
  if (user.role === 'employee') {
    const me = await getSessionEmployee();
    if (!me || me._id.toString() !== employeeId) {
      return Response.json(
        { error: 'Forbidden — you can only view your own payroll line' },
        { status: 403 }
      );
    }
    if (run.status !== 'locked') {
      return Response.json(
        { error: 'Forbidden — your payroll line is not yet available (run is in draft status)' },
        { status: 403 }
      );
    }
    return Response.json(toEmployeeSafeLine(line, run));
  }

  return Response.json({ error: 'Forbidden' }, { status: 403 });
}
