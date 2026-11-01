// src/app/api/payroll/runs/[id]/route.js
// GET   /api/payroll/runs/:id — get a single payroll run with all lines (HR/Admin only)
// PATCH /api/payroll/runs/:id — lock the run (HR/Admin only, draft → locked)
//
// V3 Step 5 — Draft → Locked transition.
// Before lock: HR/Admin can review all lines, assumptions, totals, exceptions.
// Lock records actor/time and makes run/lines immutable through normal routes.
// Stale or duplicate lock requests are rejected safely (422).
// No unlock, delete, bank file, payment status, or actual disbursement.
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
    lockedBy: run.lockedBy || '',
    lockedByName: run.lockedByName || '',
    lockedAt: run.lockedAt || null,
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

export async function PATCH(request, { params }) {
  let user;
  try {
    user = await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json(
      { error: status === 403 ? 'Forbidden — only HR/Admin can lock payroll runs' : 'Unauthorized' },
      { status }
    );
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  if (body.action !== 'lock') {
    return Response.json({ error: { _: 'Only "lock" action is supported via PATCH' } }, { status: 422 });
  }

  const { id } = await params;
  await connectDB();

  // Use findOneAndUpdate with a status filter to prevent race conditions.
  // Only a draft run can be locked. If already locked, return 422 (stale/duplicate).
  const result = await PayrollRun.findOneAndUpdate(
    { _id: id, status: 'draft' },
    {
      $set: {
        status: 'locked',
        lockedBy: user.id,
        lockedByName: user.name || '',
        lockedAt: new Date(),
      },
    },
    { new: true }
  ).lean();

  if (!result) {
    // Either not found, or already locked (stale/duplicate lock request).
    const existing = await PayrollRun.findById(id).lean();
    if (!existing) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    // Already locked — reject safely.
    return Response.json({
      error: {
        _: `Run is already locked (by ${existing.lockedByName} at ${existing.lockedAt?.toISOString()})`,
      },
    }, { status: 422 });
  }

  return Response.json(toSafeRun(result));
}
