// src/app/api/payroll/runs/[id]/route.js
// GET /api/payroll/runs/:id — get a single payroll run with all lines (HR/Admin only)
//
// V3 Step 4 — run detail with immutable line snapshots.
// Lines are never recomputed; they are frozen at generation time.
import { connectDB, PayrollRun } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';

function toSafeRun(run) {
  return {
    id: run._id.toString(),
    company: run.company,
    year: run.year,
    month: run.month,
    status: run.status,
    lineCount: (run.lines || []).length,
    totalBasePay: run.totalBasePay,
    totalGrossPay: run.totalGrossPay,
    totalIllustrativeGross: run.totalIllustrativeGross,
    calcMode: run.calcMode,
    calcVersion: run.calcVersion,
    displayCurrency: run.displayCurrency,
    generatedBy: run.generatedBy,
    generatedByName: run.generatedByName,
    generatedAt: run.generatedAt,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    lines: (run.lines || []).map((l) => ({
      employeeId: l.employeeId?.toString(),
      employeeCode: l.employeeCode,
      employeeName: l.employeeName,
      department: l.department,
      designation: l.designation,
      basePay: l.basePay,
      allowances: l.allowances || [],
      grossPay: l.grossPay,
      compensationEffectiveDate: l.compensationEffectiveDate,
      calcMode: l.calcMode,
      calendarDays: l.calendarDays,
      payableDays: l.payableDays,
      absentDays: l.absentDays,
      unpaidLeaveDays: l.unpaidLeaveDays,
      paidLeaveDays: l.paidLeaveDays,
      ambiguousDays: l.ambiguousDays,
      illustrativeGross: l.illustrativeGross,
      generatedByName: l.generatedByName,
      generatedAt: l.generatedAt,
      limitations: l.limitations || [],
    })),
  };
}

export async function GET(request, { params }) {
  let user;
  try {
    user = await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json(
      { error: status === 403 ? 'Forbidden — payroll runs require HR/Admin role' : 'Unauthorized' },
      { status }
    );
  }

  const { id } = await params;
  await connectDB();
  const run = await PayrollRun.findById(id).lean();
  if (!run) return Response.json({ error: 'Not found' }, { status: 404 });

  return Response.json(toSafeRun(run));
}
