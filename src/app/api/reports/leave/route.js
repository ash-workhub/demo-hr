// src/app/api/reports/leave/route.js
// GET /api/reports/leave?startDate=&endDate=&year=&format=json|csv
//
// Authorization (server-enforced):
//   employee  → own data only
//   manager   → own direct reports only
//   hr/admin  → all FegHR Demo employees
//
// Date range limited to 90 days. Row count limited to 500.
// CSV export excludes sensitive fields (routeSnapshot, reassignmentHistory, etc.).
import { connectDB, Employee, LeaveRequest } from '@/lib/db/index.js';
import { requireUser, getSessionEmployee } from '@/lib/auth-helpers.js';
import { computeLeaveReport, toCsv, validateDateRange } from '@/lib/report-engine.js';

export async function GET(request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectDB();

  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'json';
  const year = searchParams.get('year');

  // Leave report can filter by date range OR by year.
  // If startDate/endDate provided, use date range (max 90 days).
  // If only year provided, filter by year.
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  let dateFilter = {};
  let rangeLabel = '';

  if (startDate && endDate) {
    const rangeCheck = validateDateRange(startDate, endDate, 90);
    if (!rangeCheck.ok) {
      return Response.json({ error: { _: rangeCheck.error } }, { status: 422 });
    }
    // LeaveRequest stores startDate/endDate as Date objects. Filter where the
    // leave's date range overlaps with the requested range.
    dateFilter = {
      startDate: { $lte: rangeCheck.end },
      endDate: { $gte: rangeCheck.start },
    };
    rangeLabel = `${startDate} to ${endDate}`;
  } else if (year) {
    const y = parseInt(year, 10);
    if (isNaN(y)) return Response.json({ error: { _: 'Invalid year' } }, { status: 422 });
    const yearStart = new Date(y, 0, 1);
    const yearEnd = new Date(y, 11, 31, 23, 59, 59);
    dateFilter = {
      startDate: { $lte: yearEnd },
      endDate: { $gte: yearStart },
    };
    rangeLabel = `year ${y}`;
  } else {
    return Response.json({ error: { _: 'Provide startDate+endDate or year parameter' } }, { status: 422 });
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

  // --- Fetch leave requests ---
  const leaves = await LeaveRequest.find({ ...employeeFilter, ...dateFilter })
    .limit(500)
    .lean();

  // --- Fetch employees for breakdown ---
  const empIds = [...new Set(leaves.map((l) => l.employeeId?.toString()).filter(Boolean))];
  const employees = empIds.length > 0
    ? await Employee.find({ _id: { $in: empIds } }).lean()
    : [];

  // --- Compute report ---
  const report = computeLeaveReport(leaves, employees);

  // --- CSV export (if requested) ---
  if (format === 'csv') {
    const headers = [
      { key: 'employeeCode', label: 'Employee Code' },
      { key: 'employeeName', label: 'Employee Name' },
      { key: 'department', label: 'Department' },
      { key: 'casual', label: 'Casual Days' },
      { key: 'sick', label: 'Sick Days' },
      { key: 'earned', label: 'Earned Days' },
      { key: 'unpaid', label: 'Unpaid Days' },
      { key: 'totalDays', label: 'Total Days' },
      { key: 'approved', label: 'Approved Days' },
      { key: 'pending', label: 'Pending Days' },
      { key: 'rejected', label: 'Rejected Days' },
    ];
    const csv = toCsv(report.byEmployee, headers);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leave-report-${rangeLabel.replace(/\s+/g, '-')}.csv"`,
      },
    });
  }

  return Response.json({
    scope: scopeLabel,
    range: rangeLabel,
    ...report,
  });
}
