// src/app/api/attendance/schedules/[employeeId]/route.js
// GET /api/attendance/schedules/:employeeId  — full schedule history for one employee
//   hr/admin: any; manager: own reports; employee: own only.
import { connectDB, Employee, EmployeeSchedule } from '@/lib/db/index.js';
import { requireUser, getSessionEmployee } from '@/lib/auth-helpers.js';

function toSafe(s) {
  return {
    id: s._id.toString(),
    effectiveDate: s.effectiveDate,
    endDate: s.endDate,
    policyId: s.policyId ? s.policyId.toString() : null,
    customStartTime: s.customStartTime,
    customEndTime: s.customEndTime,
    customWorkdays: s.customWorkdays || [],
    reason: s.reason || '',
    isCurrent: s.endDate === null,
  };
}

export async function GET(request, { params }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { employeeId } = await params;
  await connectDB();

  const target = await Employee.findById(employeeId).lean();
  if (!target) return Response.json({ error: 'Employee not found' }, { status: 404 });

  if (user.role === 'employee') {
    const me = await getSessionEmployee();
    if (!me || me._id.toString() !== employeeId) {
      return Response.json({ error: 'Forbidden — can only view your own schedule history' }, { status: 403 });
    }
  } else if (user.role === 'manager') {
    const me = await getSessionEmployee();
    if (!target.managerId || target.managerId.toString() !== me._id.toString()) {
      return Response.json({ error: 'Forbidden — can only view your direct reports\' schedule history' }, { status: 403 });
    }
  }

  const items = await EmployeeSchedule.find({ employeeId }).sort({ effectiveDate: 1 }).lean();
  return Response.json({
    employee: {
      id: target._id.toString(),
      fullName: `${target.firstName} ${target.lastName}`,
      employeeCode: target.employeeId,
    },
    history: items.map(toSafe),
  });
}
