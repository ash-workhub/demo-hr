// src/app/api/payroll/preview/route.js
// POST /api/payroll/preview — HR/Admin preview of illustrative monthly gross calculation.
// Shows assumptions, source day counts, and the computed result before any payroll run.
//
// V3 Step 3 — illustrative only. No tax/deductions/net/payroll runs.
import { connectDB, CompensationRecord, Employee, PayrollSettings, Attendance, LeaveRequest } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { updatePayrollSettingsSchema, validate } from '@/lib/zod-schemas.js';
import {
  calendarDaysInMonth,
  getEffectiveCompensation,
  classifyDay,
  computeMonthlyGross,
  previewCalculation,
} from '@/lib/payroll-calc-engine.js';
import { formatMoney } from '@/lib/compensation-engine.js';
import { todayKey } from '@/lib/attendance.js';

const COMPANY = 'FegHR Demo';

export async function POST(request) {
  let user;
  try {
    user = await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json(
      { error: status === 403 ? 'Forbidden — payroll preview requires HR/Admin role' : 'Unauthorized' },
      { status }
    );
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  const { employeeId, year, month, mode = 'FULL_MONTH' } = body;
  if (!employeeId || !year || !month) {
    return Response.json({ error: { _: 'employeeId, year, and month are required' } }, { status: 422 });
  }

  if (mode !== 'FULL_MONTH' && mode !== 'PRORATED') {
    return Response.json({ error: { _: 'mode must be FULL_MONTH or PRORATED' } }, { status: 422 });
  }

  await connectDB();

  // Get employee.
  const emp = await Employee.findById(employeeId).lean();
  if (!emp) return Response.json({ error: { employeeId: 'Employee not found' } }, { status: 422 });

  // Get all compensation records for this employee (sorted by effectiveDate).
  const compRecords = await CompensationRecord.find({
    employeeId: emp._id,
    company: COMPANY,
  }).sort({ effectiveDate: 1 }).lean();

  // Get the effective compensation for the 15th of the month (mid-month reference).
  const midMonth = new Date(year, month - 1, 15);
  const compensation = getEffectiveCompensation(midMonth, compRecords);

  // Get display currency.
  const settings = await PayrollSettings.findOne({ company: COMPANY }).lean();
  const currency = settings?.displayCurrency || 'BDT';

  // Build day classifications from V2 attendance + leave data.
  const calDays = calendarDaysInMonth(year, month);
  const dayClassifications = [];

  // Load attendance records for this month.
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const attendanceRecords = await Attendance.find({
    employeeId: emp._id,
    date: { $regex: `^${monthPrefix}-` },
  }).lean();
  const attByDate = new Map();
  for (const a of attendanceRecords) {
    attByDate.set(a.date, a);
  }

  // Load approved leave requests that overlap this month.
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59);
  const leaves = await LeaveRequest.find({
    employeeId: emp._id,
    status: 'approved',
    startDate: { $lte: monthEnd },
    endDate: { $gte: monthStart },
  }).lean();

  // For each day, check if there's an approved leave covering it.
  function findLeaveForDate(dayNum) {
    const date = new Date(year, month - 1, dayNum);
    date.setHours(12, 0, 0, 0);
    for (const l of leaves) {
      const ls = new Date(l.startDate);
      ls.setHours(0, 0, 0, 0);
      const le = new Date(l.endDate);
      le.setHours(23, 59, 59, 999);
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

  // Compute the illustrative gross.
  const result = previewCalculation({
    year,
    month,
    mode,
    compensation,
    dayClassifications,
  });

  // Add display formatting.
  result.calculation.monthlyGrossDisplay = formatMoney(result.calculation.monthlyGross, currency);
  result.calculation.illustrativeGrossDisplay = formatMoney(result.calculation.illustrativeGross, currency);
  result.employee = {
    id: emp._id.toString(),
    fullName: `${emp.firstName} ${emp.lastName}`,
    employeeCode: emp.employeeId,
  };

  return Response.json(result);
}
