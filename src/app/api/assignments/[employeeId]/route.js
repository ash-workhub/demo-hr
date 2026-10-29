// src/app/api/assignments/[employeeId]/route.js
// GET /api/assignments/:employeeId  — full assignment history for one employee
//   hr/admin: any employee; manager: own reports; employee: own only.
import { connectDB, Employee, EmployeeAssignment } from '@/lib/db/index.js';
import { requireUser, getSessionEmployee } from '@/lib/auth-helpers.js';

function toSafe(a) {
  return {
    id: a._id.toString(),
    branchId: a.branchId ? a.branchId.toString() : null,
    departmentId: a.departmentId ? a.departmentId.toString() : null,
    designationId: a.designationId ? a.designationId.toString() : null,
    managerId: a.managerId ? a.managerId.toString() : null,
    branchName: a.branchName || '',
    departmentName: a.departmentName || '',
    designationName: a.designationName || '',
    managerName: a.managerName || '',
    effectiveDate: a.effectiveDate,
    endDate: a.endDate,
    reason: a.reason || '',
    createdBy: a.createdBy || '',
    isCurrent: a.endDate === null,
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

  // Permission check.
  if (user.role === 'employee') {
    const me = await getSessionEmployee();
    if (!me || me._id.toString() !== employeeId) {
      return Response.json({ error: 'Forbidden — can only view your own assignment history' }, { status: 403 });
    }
  } else if (user.role === 'manager') {
    const me = await getSessionEmployee();
    if (!target.managerId || target.managerId.toString() !== me._id.toString()) {
      return Response.json({ error: 'Forbidden — can only view your direct reports\' history' }, { status: 403 });
    }
  }
  // hr/admin: no extra check.

  const items = await EmployeeAssignment.find({ employeeId })
    .sort({ effectiveDate: 1 }) // oldest first (chronological history)
    .lean();

  return Response.json({
    employee: {
      id: target._id.toString(),
      fullName: `${target.firstName} ${target.lastName}`,
      employeeCode: target.employeeId,
      joinDate: target.joinDate,
    },
    history: items.map(toSafe),
  });
}
