// src/app/api/reports/attendance/route.js
// GET /api/reports/attendance?startDate=&endDate=&format=json|csv
//
// Authorization (server-enforced):
//   employee  → own data only
//   manager   → own direct reports only
//   hr/admin  → all FegHR Demo employees
//
// Date range limited to 90 days. Row count limited to 500.
// CSV export excludes sensitive fields (rawPunches, policySnapshot, correctedX).
import { connectDB, Employee, Attendance } from '@/lib/db/index.js';
import { requireUser, getSessionEmployee } from '@/lib/auth-helpers.js';
import { computeAttendanceReport, toCsv, validateDateRange, todayKey } from '@/lib/report-engine.js';

export async function GET(request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectDB();

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate') || todayKey();
  const endDate = searchParams.get('endDate') || todayKey();
  const format = searchParams.get('format') || 'json';

  // Validate date range (max 90 days).
  const rangeCheck = validateDateRange(startDate, endDate, 90);
  if (!rangeCheck.ok) {
    return Response.json({ error: { _: rangeCheck.error } }, { status: 422 });
  }

  // --- Authorization scoping ---
  let employeeFilter = {};
  let scopeLabel = 'all';

  if (user.role === 'employee') {
    const me = await getSessionEmployee();
    if (!me) return Response.json({ error: 'No linked employee record' }, { status: 403 });
    employeeFilter = { employeeId: me._id };
    scopeLabel = 'self';
  } else if (user.role === 'manager') {
    const me = await getSessionEmployee();
    if (!me) return Response.json({ error: 'No linked employee record' }, { status: 403 });
    const reportIds = (await Employee.find({ managerId: me._id, status: 'active' }).select('_id').lean()).map((e) => e._id);
    employeeFilter = { employeeId: { $in: reportIds } };
    scopeLabel = 'team';
  }
  // hr/admin: no filter (all employees)

  // --- Fetch attendance records within date range ---
  // Date is stored as YYYY-MM-DD string (Asia/Dhaka). Filter by string comparison.
  const records = await Attendance.find({
    ...employeeFilter,
    date: { $gte: startDate, $lte: endDate },
  })
    .limit(500)
    .lean();

  // --- Fetch employees for breakdown ---
  const empIds = [...new Set(records.map((r) => r.employeeId?.toString()).filter(Boolean))];
  const employees = empIds.length > 0
    ? await Employee.find({ _id: { $in: empIds } }).lean()
    : [];

  // --- Compute report ---
  const report = computeAttendanceReport(records, employees);

  // --- CSV export (if requested) ---
  if (format === 'csv') {
    const headers = [
      { key: 'employeeCode', label: 'Employee Code' },
      { key: 'employeeName', label: 'Employee Name' },
      { key: 'department', label: 'Department' },
      { key: 'totalDays', label: 'Total Days' },
      { key: 'present', label: 'Present' },
      { key: 'late', label: 'Late' },
      { key: 'absent', label: 'Absent' },
      { key: 'leave', label: 'Leave' },
      { key: 'holiday', label: 'Holiday' },
      { key: 'weekOff', label: 'Week Off' },
      { key: 'pending', label: 'Pending' },
      { key: 'halfDay', label: 'Half Day' },
    ];
    const csv = toCsv(report.byEmployee, headers);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="attendance-report-${startDate}-to-${endDate}.csv"`,
      },
    });
  }

  return Response.json({
    scope: scopeLabel,
    startDate,
    endDate,
    ...report,
  });
}
