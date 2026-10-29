// src/app/api/attendance/route.js
// GET  /api/attendance           — today's status (self) + team view (managers/hr/admin)
// POST /api/attendance           — check-in or check-out (self only)
import { connectDB, Employee, Attendance } from '@/lib/db/index.js';
import { requireUser, getSessionEmployee } from '@/lib/auth-helpers.js';
import { attendanceActionSchema, validate } from '@/lib/zod-schemas.js';
import { todayKey, isLate, computeStatus, formatLocalTime, lastNDays, dateKey } from '@/lib/attendance.js';

function toSafe(a, emp) {
  return {
    id: a._id.toString(),
    employeeId: a.employeeId ? a.employeeId.toString() : null,
    date: a.date,
    checkInTime: a.checkInTime,
    checkOutTime: a.checkOutTime,
    status: a.status,
    notes: a.notes || '',
    // Include employee info if populated
    employee: emp ? {
      id: emp._id.toString(),
      fullName: `${emp.firstName} ${emp.lastName}`,
      employeeCode: emp.employeeId,
      department: emp.department,
      avatarColor: emp.avatarColor,
    } : undefined,
  };
}

export async function GET(request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectDB();

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope') || 'self'; // 'self' | 'team'
  const date = searchParams.get('date') || todayKey();
  const historyDays = Math.min(30, Math.max(1, parseInt(searchParams.get('days') || '7', 10)));

  const employee = await getSessionEmployee();
  if (!employee) {
    return Response.json({ error: 'No linked employee record' }, { status: 403 });
  }

  // --- Self: today's status + last N days history ---
  if (scope === 'self') {
    const days = lastNDays(historyDays);
    const records = await Attendance.find({
      employeeId: employee._id,
      date: { $in: days },
    }).lean();
    const byDate = {};
    for (const r of records) byDate[r.date] = toSafe(r);
    return Response.json({
      scope: 'self',
      today: date,
      todayRecord: byDate[date] || null,
      history: days.map((d) => byDate[d] || { date: d, status: 'absent', checkInTime: null, checkOutTime: null }),
    });
  }

  // --- Team: managers see reports; HR/admin see all ---
  if (scope === 'team') {
    if (user.role === 'employee') {
      return Response.json({ error: 'Forbidden — team view requires manager+ role' }, { status: 403 });
    }

    let teamFilter = {};
    if (user.role === 'manager') {
      teamFilter = { managerId: employee._id, status: 'active' };
    } else {
      // hr + admin see all active employees
      teamFilter = { status: 'active' };
    }

    const teamMembers = await Employee.find(teamFilter)
      .sort({ firstName: 1, lastName: 1 })
      .lean();

    const memberIds = teamMembers.map((e) => e._id);
    const records = await Attendance.find({
      employeeId: { $in: memberIds },
      date,
    }).lean();

    const byEmp = {};
    for (const r of records) byEmp[r.employeeId.toString()] = r;

    const team = teamMembers.map((e) => ({
      employee: {
        id: e._id.toString(),
        fullName: `${e.firstName} ${e.lastName}`,
        employeeCode: e.employeeId,
        department: e.department,
        designation: e.designation,
        avatarColor: e.avatarColor,
      },
      attendance: byEmp[e._id.toString()]
        ? toSafe(byEmp[e._id.toString()])
        : { date, status: 'absent', checkInTime: null, checkOutTime: null },
    }));

    // Summary counts
    const summary = {
      total: team.length,
      present: team.filter((t) => t.attendance.status === 'present').length,
      late: team.filter((t) => t.attendance.status === 'late').length,
      absent: team.filter((t) => t.attendance.status === 'absent').length,
      leave: team.filter((t) => t.attendance.status === 'leave').length,
    };

    return Response.json({
      scope: 'team',
      date,
      team,
      summary,
    });
  }

  return Response.json({ error: 'Invalid scope' }, { status: 400 });
}

export async function POST(request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  const { data, error } = validate(attendanceActionSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  await connectDB();
  const employee = await getSessionEmployee();
  if (!employee) {
    return Response.json({ error: 'No linked employee record' }, { status: 403 });
  }

  const today = todayKey();
  const now = new Date();

  // Find or create today's record
  let record = await Attendance.findOne({ employeeId: employee._id, date: today });
  if (!record) {
    record = new Attendance({
      employeeId: employee._id,
      date: today,
      checkInTime: null,
      checkOutTime: null,
      status: 'absent',
    });
  }

  if (data.action === 'check-in') {
    if (record.checkInTime) {
      return Response.json({ error: { _: 'Already checked in today' } }, { status: 409 });
    }
    record.checkInTime = now;
    record.status = isLate(now) ? 'late' : 'present';
    if (data.notes) record.notes = data.notes;
  } else if (data.action === 'check-out') {
    if (!record.checkInTime) {
      return Response.json({ error: { _: 'Cannot check out without checking in first' } }, { status: 409 });
    }
    if (record.checkOutTime) {
      return Response.json({ error: { _: 'Already checked out today' } }, { status: 409 });
    }
    record.checkOutTime = now;
    if (data.notes) record.notes = data.notes;
  }

  await record.save();
  return Response.json(toSafe(record));
}
