// src/app/api/payroll/runs/[id]/lines/[employeeId]/route.js
// GET /api/payroll/runs/:id/lines/:employeeId — get a single employee's line from a run.
//
// V3 Step 4 — line-level access.
// HR/Admin: can view any employee's line.
// Employee: can view ONLY their own line (after lock — to be enabled in a later step).
//   For now (draft status), employees get 403 (own-line access enabled when run is locked).
// Manager: NO access (no salary access at all).
import { connectDB, PayrollRun } from '@/lib/db/index.js';
import { requireUser, getSessionEmployee } from '@/lib/auth-helpers.js';

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

  // Employees: can only view their own line, AND only when the run is locked.
  // For now, all runs are draft → employees get 403 (lock enabled in a later step).
  if (user.role === 'employee') {
    const me = await getSessionEmployee();
    if (!me || me._id.toString() !== employeeId) {
      return Response.json(
        { error: 'Forbidden — you can only view your own payroll line' },
        { status: 403 }
      );
    }
    // Check if the run is locked (own-line access only after lock).
    const run = await PayrollRun.findById(id).lean();
    if (!run) return Response.json({ error: 'Run not found' }, { status: 404 });
    if (run.status !== 'locked') {
      return Response.json(
        { error: 'Forbidden — your payroll line is not yet available (run is in draft status)' },
        { status: 403 }
      );
    }
    // Find the employee's line.
    const line = (run.lines || []).find(
      (l) => l.employeeId?.toString() === employeeId
    );
    if (!line) return Response.json({ error: 'Line not found' }, { status: 404 });
    return Response.json({
      runYear: run.year,
      runMonth: run.month,
      runStatus: run.status,
      displayCurrency: run.displayCurrency,
      employeeCode: line.employeeCode,
      employeeName: line.employeeName,
      basePay: line.basePay,
      allowances: line.allowances || [],
      grossPay: line.grossPay,
      illustrativeGross: line.illustrativeGross,
      calcMode: line.calcMode,
      calendarDays: line.calendarDays,
      payableDays: line.payableDays,
      limitations: line.limitations || [],
    });
  }

  // HR/Admin: can view any employee's line.
  const run = await PayrollRun.findById(id).lean();
  if (!run) return Response.json({ error: 'Run not found' }, { status: 404 });

  const line = (run.lines || []).find(
    (l) => l.employeeId?.toString() === employeeId
  );
  if (!line) return Response.json({ error: 'Line not found for this employee' }, { status: 404 });

  return Response.json({
    runId: run._id.toString(),
    runYear: run.year,
    runMonth: run.month,
    runStatus: run.status,
    displayCurrency: run.displayCurrency,
    employeeId: line.employeeId?.toString(),
    employeeCode: line.employeeCode,
    employeeName: line.employeeName,
    department: line.department,
    designation: line.designation,
    basePay: line.basePay,
    allowances: line.allowances || [],
    grossPay: line.grossPay,
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
    generatedByName: line.generatedByName,
    generatedAt: line.generatedAt,
    limitations: line.limitations || [],
  });
}
