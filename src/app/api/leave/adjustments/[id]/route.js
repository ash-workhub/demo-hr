// src/app/api/leave/adjustments/[id]/route.js
// GET /api/leave/adjustments/:id  — single adjustment (audit trail; permission-checked)
// No PATCH/DELETE — adjustments are append-only, never overwritten or deleted.
import { connectDB, Employee, LeaveAdjustment } from '@/lib/db/index.js';
import { requireUser, getSessionEmployee } from '@/lib/auth-helpers.js';

function toSafe(a, emp) {
  return {
    id: a._id.toString(),
    employeeId: a.employeeId ? a.employeeId.toString() : null,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown',
    employeeCode: emp?.employeeId || '',
    leaveTypeCode: a.leaveTypeCode,
    year: a.year,
    amount: a.amount,
    reason: a.reason,
    actor: a.actor,
    actorName: a.actorName,
    actorRole: a.actorRole,
    actionAt: a.actionAt,
    createdAt: a.createdAt,
  };
}

export async function GET(request, { params }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  await connectDB();
  const adj = await LeaveAdjustment.findById(id).lean();
  if (!adj) return Response.json({ error: 'Not found' }, { status: 404 });

  // Permission: employee sees own; manager sees reports; hr/admin see any.
  if (user.role === 'employee') {
    const me = await getSessionEmployee();
    if (!me || me._id.toString() !== adj.employeeId.toString()) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else if (user.role === 'manager') {
    const me = await getSessionEmployee();
    const target = await Employee.findById(adj.employeeId).lean();
    if (!target || !target.managerId || target.managerId.toString() !== me._id.toString()) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const emp = await Employee.findById(adj.employeeId).lean();
  return Response.json(toSafe(adj, emp));
}
