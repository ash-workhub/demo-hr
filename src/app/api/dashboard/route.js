// src/app/api/dashboard/route.js
// GET /api/dashboard — role-aware KPIs + chart data.
//   employee  → personal stats (attendance rate, leave balance, recent requests)
//   manager   → team stats (today's attendance, pending approvals, team leave usage)
//   hr/admin  → company-wide stats (attendance by dept, leave distribution, headcount)
import { requireUser, getSessionEmployee } from '@/lib/auth-helpers.js';
import { connectDB, Employee, Attendance, LeaveRequest, LeaveBalance } from '@/lib/db/index.js';
import { todayKey, lastNDays } from '@/lib/attendance.js';

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectDB();
  const employee = await getSessionEmployee();
  if (!employee) return Response.json({ error: 'No linked employee record' }, { status: 403 });

  const today = todayKey();
  const last7 = lastNDays(7);

  // --- Common: pending approvals count (for the bell-style indicator) ---
  let pendingApprovalsCount = 0;
  if (user.role === 'manager') {
    const reportIds = (await Employee.find({ managerId: employee._id, status: 'active' }).select('_id').lean()).map((e) => e._id);
    pendingApprovalsCount = await LeaveRequest.countDocuments({
      employeeId: { $in: reportIds },
      status: 'pending_manager',
    });
  } else if (user.role === 'hr' || user.role === 'admin') {
    pendingApprovalsCount = await LeaveRequest.countDocuments({
      status: user.role === 'admin' ? { $in: ['pending_manager', 'pending_hr'] } : 'pending_hr',
    });
  }

  // ============================================================
  // EMPLOYEE dashboard
  // ============================================================
  if (user.role === 'employee') {
    // My attendance last 7 days
    const myAttendance = await Attendance.find({
      employeeId: employee._id,
      date: { $in: last7 },
    }).lean();
    const presentDays = myAttendance.filter((a) => a.status === 'present' || a.status === 'late').length;
    const attendanceRate = Math.round((presentDays / 7) * 100);

    // My leave balance
    const year = new Date().getFullYear();
    const balance = await LeaveBalance.findOne({ employeeId: employee._id, year }).lean();
    let leaveBalance = null;
    if (balance) {
      const total = (balance.casual.total + balance.sick.total + balance.earned.total);
      const used = (balance.casual.used + balance.sick.used + balance.earned.used);
      leaveBalance = {
        total, used, remaining: total - used,
        casual: { ...balance.casual, remaining: balance.casual.total - balance.casual.used },
        sick: { ...balance.sick, remaining: balance.sick.total - balance.sick.used },
        earned: { ...balance.earned, remaining: balance.earned.total - balance.earned.used },
        unpaid: balance.unpaid,
      };
    }

    // My recent leave requests (last 5)
    const myLeaves = await LeaveRequest.find({ employeeId: employee._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // 7-day attendance trend (for mini bar chart)
    const trend = last7.map((d) => {
      const rec = myAttendance.find((a) => a.date === d);
      return {
        date: d.slice(5), // MM-DD
        present: rec && (rec.status === 'present' || rec.status === 'late') ? 1 : 0,
        status: rec?.status || 'absent',
      };
    });

    return Response.json({
      role: 'employee',
      today,
      kpis: {
        attendanceRate,
        presentDays,
        totalDays: 7,
        leaveRemaining: leaveBalance?.remaining || 0,
        leaveUsed: leaveBalance?.used || 0,
        pendingRequests: myLeaves.filter((l) => l.status === 'pending_manager' || l.status === 'pending_hr').length,
      },
      attendanceTrend: trend,
      leaveBalance,
      recentLeaves: myLeaves.map((l) => ({
        id: l._id.toString(),
        leaveType: l.leaveType,
        days: l.days,
        status: l.status,
        startDate: l.startDate,
        endDate: l.endDate,
      })),
    });
  }

  // ============================================================
  // MANAGER dashboard
  // ============================================================
  if (user.role === 'manager') {
    const reports = await Employee.find({ managerId: employee._id, status: 'active' }).lean();
    const reportIds = reports.map((e) => e._id);

    // Today's team attendance
    const todayRecords = await Attendance.find({
      employeeId: { $in: reportIds },
      date: today,
    }).lean();
    const summary = { present: 0, late: 0, absent: 0, leave: 0 };
    for (const r of todayRecords) {
      if (summary[r.status] !== undefined) summary[r.status]++;
    }
    summary.absent = reports.length - summary.present - summary.late - summary.leave;

    // Team leave usage this year
    const year = new Date().getFullYear();
    const teamBalances = await LeaveBalance.find({
      employeeId: { $in: reportIds },
      year,
    }).lean();
    const teamLeaveUsage = teamBalances.reduce(
      (acc, b) => {
        acc.casual += b.casual.used;
        acc.sick += b.sick.used;
        acc.earned += b.earned.used;
        acc.unpaid += b.unpaid.used;
        return acc;
      },
      { casual: 0, sick: 0, earned: 0, unpaid: 0 }
    );

    // Pending approvals (already counted above)
    // Recent team leave requests
    const teamLeaves = await LeaveRequest.find({ employeeId: { $in: reportIds } })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate({ path: 'employeeId', select: 'firstName lastName employeeId', model: 'Employee' })
      .lean();

    return Response.json({
      role: 'manager',
      today,
      kpis: {
        teamSize: reports.length,
        presentToday: summary.present + summary.late,
        absentToday: summary.absent,
        pendingApprovals: pendingApprovalsCount,
      },
      attendanceSummary: summary,
      attendanceSummaryTotal: reports.length,
      teamLeaveUsage,
      teamLeaves: teamLeaves.map((l) => ({
        id: l._id.toString(),
        leaveType: l.leaveType,
        days: l.days,
        status: l.status,
        startDate: l.startDate,
        employee: l.employeeId ? {
          fullName: `${l.employeeId.firstName} ${l.employeeId.lastName}`,
          employeeCode: l.employeeId.employeeId,
        } : null,
      })),
    });
  }

  // ============================================================
  // HR / ADMIN dashboard
  // ============================================================
  // Company-wide stats
  const allEmployees = await Employee.find({ status: 'active' }).lean();
  const allIds = allEmployees.map((e) => e._id);

  // Today's attendance company-wide
  const todayRecords = await Attendance.find({ date: today }).lean();
  const companySummary = { present: 0, late: 0, absent: 0, leave: 0 };
  for (const r of todayRecords) {
    if (companySummary[r.status] !== undefined) companySummary[r.status]++;
  }
  companySummary.absent = allEmployees.length - companySummary.present - companySummary.late - companySummary.leave;

  // Headcount by department
  const deptCounts = {};
  for (const e of allEmployees) {
    deptCounts[e.department] = (deptCounts[e.department] || 0) + 1;
  }
  const headcountByDept = Object.entries(deptCounts).map(([name, count]) => ({ name, count }));

  // Attendance rate by department (today)
  const attendanceByDept = Object.entries(deptCounts).map(([dept, total]) => {
    const deptEmployees = allEmployees.filter((e) => e.department === dept).map((e) => e._id.toString());
    const present = todayRecords.filter(
      (r) => deptEmployees.includes(r.employeeId.toString()) && (r.status === 'present' || r.status === 'late')
    ).length;
    return {
      name: dept,
      present,
      absent: total - present,
      total,
      rate: total ? Math.round((present / total) * 100) : 0,
    };
  });

  // Leave status distribution (this year)
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const allLeaves = await LeaveRequest.find({ createdAt: { $gte: yearStart } }).lean();
  const leaveDistribution = {
    pending_manager: 0,
    pending_hr: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
  };
  for (const l of allLeaves) {
    if (leaveDistribution[l.status] !== undefined) leaveDistribution[l.status]++;
  }

  // Leave type usage (this year)
  const leaveTypeUsage = { casual: 0, sick: 0, earned: 0, unpaid: 0 };
  for (const l of allLeaves) {
    if (l.status === 'approved' && leaveTypeUsage[l.leaveType] !== undefined) {
      leaveTypeUsage[l.leaveType] += l.days;
    }
  }

  return Response.json({
    role: user.role,
    today,
    kpis: {
      totalEmployees: allEmployees.length,
      presentToday: companySummary.present + companySummary.late,
      absentToday: companySummary.absent,
      pendingApprovals: pendingApprovalsCount,
      totalLeavesThisYear: allLeaves.length,
    },
    companyAttendance: companySummary,
    companyAttendanceTotal: allEmployees.length,
    headcountByDept,
    attendanceByDept,
    leaveDistribution,
    leaveTypeUsage,
  });
}
