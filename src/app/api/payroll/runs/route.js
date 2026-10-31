// src/app/api/payroll/runs/route.js
// GET  /api/payroll/runs          — list all runs (HR/Admin only)
// POST /api/payroll/runs          — generate a draft run for a company/month (HR/Admin only)
//
// V3 Step 4 — one Draft payroll run per company/calendar month.
// Idempotent: duplicate generation for the same (company, year, month) returns
// the existing run, never duplicates lines or totals.
// Lines are immutable snapshots — never recomputed from mutable data.
import { connectDB, PayrollRun, PayrollSettings, Employee, CompensationRecord, Attendance, LeaveRequest } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { generatePayrollRunSchema, validate } from '@/lib/zod-schemas.js';
import {
  calendarDaysInMonth,
  getEffectiveCompensation,
  classifyDay,
  computeMonthlyGross,
} from '@/lib/payroll-calc-engine.js';

const COMPANY = 'FegHR Demo';

function toSafeRun(run, includeLines = true) {
  const safe = {
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
  };
  if (includeLines) {
    safe.lines = (run.lines || []).map((l) => ({
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
      calcVersion: l.calcVersion,
      displayCurrency: l.displayCurrency,
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
    }));
  }
  return safe;
}

export async function GET(request) {
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

  await connectDB();
  const runs = await PayrollRun.find({ company: COMPANY }).sort({ year: -1, month: -1 }).lean();
  return Response.json({ items: runs.map((r) => toSafeRun(r, false)) });
}

export async function POST(request) {
  let user;
  try {
    user = await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json(
      { error: status === 403 ? 'Forbidden — only HR/Admin can generate payroll runs' : 'Unauthorized' },
      { status }
    );
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  const { data, error } = validate(generatePayrollRunSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  await connectDB();

  // --- Idempotency: check if a run already exists for this (company, year, month) ---
  const existing = await PayrollRun.findOne({
    company: COMPANY,
    year: data.year,
    month: data.month,
  }).lean();

  if (existing) {
    // Return the existing run (idempotent — no duplication).
    return Response.json({
      ...toSafeRun(existing, false),
      idempotent: true,
      message: `Payroll run for ${data.year}-${String(data.month).padStart(2, '0')} already exists`,
    });
  }

  // --- Get payroll settings ---
  const settings = await PayrollSettings.findOne({ company: COMPANY }).lean();
  const currency = settings?.displayCurrency || 'BDT';
  const mode = data.mode || 'FULL_MONTH';

  // --- Get all active employees with compensation ---
  const employees = await Employee.find({ status: 'active' }).sort({ firstName: 1, lastName: 1 }).lean();

  // --- Load all compensation records (batch) ---
  const allCompRecords = await CompensationRecord.find({ company: COMPANY }).sort({ effectiveDate: 1 }).lean();
  const compByEmployee = new Map();
  for (const cr of allCompRecords) {
    const eid = cr.employeeId.toString();
    if (!compByEmployee.has(eid)) compByEmployee.set(eid, []);
    compByEmployee.get(eid).push(cr);
  }

  // --- Load attendance + leaves for the month (batch) ---
  const monthPrefix = `${data.year}-${String(data.month).padStart(2, '0')}`;
  const monthStart = new Date(data.year, data.month - 1, 1);
  const monthEnd = new Date(data.year, data.month, 0, 23, 59, 59);
  const calDays = calendarDaysInMonth(data.year, data.month);

  const allAttendance = await Attendance.find({
    date: { $regex: `^${monthPrefix}-` },
  }).lean();
  const attByEmployee = new Map();
  for (const a of allAttendance) {
    const eid = a.employeeId.toString();
    if (!attByEmployee.has(eid)) attByEmployee.set(eid, []);
    attByEmployee.get(eid).push(a);
  }

  const allLeaves = await LeaveRequest.find({
    status: 'approved',
    startDate: { $lte: monthEnd },
    endDate: { $gte: monthStart },
  }).lean();
  const leavesByEmployee = new Map();
  for (const l of allLeaves) {
    const eid = l.employeeId.toString();
    if (!leavesByEmployee.has(eid)) leavesByEmployee.set(eid, []);
    leavesByEmployee.get(eid).push(l);
  }

  // --- Build immutable line snapshots ---
  const lines = [];
  let totalBasePay = 0;
  let totalGrossPay = 0;
  let totalIllustrativeGross = 0;

  const midMonth = new Date(data.year, data.month - 1, 15);

  for (const emp of employees) {
    const eid = emp._id.toString();
    const compRecords = compByEmployee.get(eid) || [];
    const compensation = getEffectiveCompensation(midMonth, compRecords);

    // Build day classifications for this employee.
    const dayClassifications = [];
    const empAttendance = attByEmployee.get(eid) || [];
    const attByDate = new Map(empAttendance.map((a) => [a.date, a]));
    const empLeaves = leavesByEmployee.get(eid) || [];

    function findLeaveForDate(dayNum) {
      const date = new Date(data.year, data.month - 1, dayNum);
      date.setHours(12, 0, 0, 0);
      for (const l of empLeaves) {
        const ls = new Date(l.startDate); ls.setHours(0, 0, 0, 0);
        const le = new Date(l.endDate); le.setHours(23, 59, 59, 999);
        if (date >= ls && date <= le) return l;
      }
      return null;
    }

    for (let day = 1; day <= calDays; day++) {
      const dateKey = `${monthPrefix}-${String(day).padStart(2, '0')}`;
      const att = attByDate.get(dateKey) || null;
      const leave = findLeaveForDate(day);
      dayClassifications.push(classifyDay(att, leave));
    }

    // Compute illustrative gross.
    const calcResult = computeMonthlyGross({
      year: data.year,
      month: data.month,
      mode,
      compensation,
      dayClassifications,
    });

    const line = {
      employeeId: emp._id,
      employeeCode: emp.employeeId,
      employeeName: `${emp.firstName} ${emp.lastName}`,
      department: emp.department || '',
      designation: emp.designation || '',
      basePay: compensation?.basePay || 0,
      allowances: (compensation?.allowances || []).map((a) => ({ name: a.name, amount: a.amount })),
      grossPay: compensation?.grossPay || 0,
      compensationEffectiveDate: compensation?.effectiveDate || new Date(data.year, data.month - 1, 1),
      calcMode: mode,
      calcVersion: 'v3-step3',
      displayCurrency: currency,
      calendarDays: calcResult.calendarDays,
      payableDays: calcResult.payableDays,
      absentDays: calcResult.absentDays,
      unpaidLeaveDays: calcResult.unpaidLeaveDays,
      paidLeaveDays: calcResult.paidLeaveDays,
      ambiguousDays: calcResult.ambiguousDays,
      illustrativeGross: calcResult.illustrativeGross,
      generatedBy: user.id,
      generatedByName: user.name || '',
      generatedAt: new Date(),
      limitations: calcResult.limitations || [],
    };

    lines.push(line);
    totalBasePay += line.basePay;
    totalGrossPay += line.grossPay;
    totalIllustrativeGross += line.illustrativeGross;
  }

  // --- Create the run (atomic — unique index prevents concurrent duplicates) ---
  try {
    const run = await PayrollRun.create({
      company: COMPANY,
      year: data.year,
      month: data.month,
      status: 'draft',
      lines,
      totalBasePay,
      totalGrossPay,
      totalIllustrativeGross,
      generatedBy: user.id,
      generatedByName: user.name || '',
      generatedAt: new Date(),
      calcMode: mode,
      calcVersion: 'v3-step3',
      displayCurrency: currency,
    });
    return Response.json(toSafeRun(run, false), { status: 201 });
  } catch (e) {
    if (e.code === 11000) {
      // Race condition: another request created the run between our check and create.
      // Return the existing run (idempotent).
      const existing = await PayrollRun.findOne({
        company: COMPANY,
        year: data.year,
        month: data.month,
      }).lean();
      return Response.json({
        ...toSafeRun(existing, false),
        idempotent: true,
        message: 'Payroll run was created by a concurrent request',
      });
    }
    return Response.json({ error: { _: 'Failed to create payroll run: ' + e.message } }, { status: 500 });
  }
}
