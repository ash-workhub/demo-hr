// src/app/api/assignments/route.js
// GET  /api/assignments   — list assignments (hr/admin: all; manager: own reports; employee: own)
// POST /api/assignments   — create a new effective-dated assignment (hr/admin only)
//
// Creating a new assignment:
//   1. Validates the employee exists
//   2. Validates all provided reference IDs exist + are active
//   3. Validates the managerId doesn't create a cycle (walks the manager chain)
//   4. Validates the effectiveDate (not before joinDate, not before prev effectiveDate)
//   5. Closes the current assignment (sets endDate = newEffectiveDate - 1)
//   6. Creates the new assignment (endDate = null, the new "current")
//   7. Updates the Employee doc's denormalized fields (department/designation strings,
//      branchId/departmentId/designationId/managerId refs) for V1 compat
import { connectDB, Employee, EmployeeAssignment, Branch, Department, Designation } from '@/lib/db/index.js';
import { requireUser, requireRole, getSessionEmployee } from '@/lib/auth-helpers.js';
import { createAssignmentSchema, validate } from '@/lib/zod-schemas.js';
import {
  detectManagerCycle,
  validateEffectiveDate,
  validateReferenceStatuses,
  computePrevEndDate,
} from '@/lib/org-engine.js';

function toSafe(a) {
  return {
    id: a._id.toString(),
    employeeId: a.employeeId ? a.employeeId.toString() : null,
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
    createdAt: a.createdAt,
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
  const employeeId = searchParams.get('employeeId');

  // Permission: hr/admin can see any; manager can see own reports; employee sees own.
  let filter = {};
  if (employeeId) {
    filter.employeeId = employeeId;
    if (user.role === 'employee') {
      const me = await getSessionEmployee();
      if (!me || me._id.toString() !== employeeId) {
        return Response.json({ error: 'Forbidden — can only view your own assignment history' }, { status: 403 });
      }
    } else if (user.role === 'manager') {
      const me = await getSessionEmployee();
      const target = await Employee.findById(employeeId).lean();
      if (!target || !target.managerId || target.managerId.toString() !== me._id.toString()) {
        return Response.json({ error: 'Forbidden — can only view your direct reports\' history' }, { status: 403 });
      }
    }
    // hr/admin: no extra check
  } else {
    // No employeeId: hr/admin can list all; manager/employee must scope to self.
    if (user.role === 'employee' || user.role === 'manager') {
      const me = await getSessionEmployee();
      if (!me) return Response.json({ error: 'No linked employee record' }, { status: 403 });
      // For managers, show their reports' assignments + their own.
      if (user.role === 'manager') {
        const reportIds = (await Employee.find({ managerId: me._id, status: 'active' }).select('_id').lean()).map((e) => e._id);
        filter.employeeId = { $in: [me._id, ...reportIds] };
      } else {
        filter.employeeId = me._id;
      }
    }
  }

  const items = await EmployeeAssignment.find(filter).sort({ effectiveDate: -1 }).limit(100).lean();
  return Response.json({ items: items.map(toSafe) });
}

export async function POST(request) {
  let user;
  try {
    user = await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json({ error: status === 403 ? 'Forbidden' : 'Unauthorized' }, { status });
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  const { data, error } = validate(createAssignmentSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  await connectDB();

  // 1. Validate employee exists.
  const emp = await Employee.findById(data.employeeId);
  if (!emp) return Response.json({ error: { employeeId: 'Employee not found' } }, { status: 422 });

  // 2. Validate reference IDs exist + are active.
  const refs = {};
  if (data.branchId) refs.branch = await Branch.findById(data.branchId).lean();
  if (data.departmentId) refs.department = await Department.findById(data.departmentId).lean();
  if (data.designationId) refs.designation = await Designation.findById(data.designationId).lean();
  const refCheck = validateReferenceStatuses(refs);
  if (!refCheck.ok) return Response.json({ error: refCheck.errors }, { status: 422 });

  // 3. Validate managerId: exists, role manager/hr/admin, no self, no cycle.
  let managerName = '';
  if (data.managerId) {
    if (data.managerId === emp._id.toString()) {
      return Response.json({ error: { managerId: 'Employee cannot be their own manager' } }, { status: 422 });
    }
    const mgr = await Employee.findById(data.managerId).lean();
    if (!mgr) return Response.json({ error: { managerId: 'Manager not found' } }, { status: 422 });
    if (!['manager', 'hr', 'admin'].includes(mgr.role)) {
      return Response.json({ error: { managerId: `Selected employee has role '${mgr.role}' — only manager/hr/admin can be managers` } }, { status: 422 });
    }
    managerName = `${mgr.firstName} ${mgr.lastName}`;

    // Cycle detection: build a map of current manager relationships, then check
    // if setting emp.managerId = data.managerId creates a cycle.
    const allEmps = await Employee.find({ status: 'active' }).select('_id managerId').lean();
    const managerMap = new Map();
    for (const e of allEmps) {
      managerMap.set(e._id.toString(), e.managerId ? e.managerId.toString() : null);
    }
    // Temporarily apply the proposed change for cycle detection.
    managerMap.set(emp._id.toString(), data.managerId);
    const cycle = detectManagerCycle(emp._id.toString(), data.managerId, managerMap);
    if (cycle.hasCycle) {
      return Response.json({ error: { managerId: cycle.reason } }, { status: 422 });
    }
  }

  // 4. Validate effectiveDate.
  // Find the current assignment (endDate = null) to get prevEffectiveDate.
  const currentAssignment = await EmployeeAssignment.findOne({ employeeId: emp._id, endDate: null }).lean();
  const prevEffectiveDate = currentAssignment ? currentAssignment.effectiveDate : null;
  const dateCheck = validateEffectiveDate(data.effectiveDate, emp.joinDate, prevEffectiveDate);
  if (!dateCheck.ok) {
    return Response.json({ error: { effectiveDate: dateCheck.reason } }, { status: 422 });
  }

  // 5. Close the current assignment (set endDate = newEffectiveDate - 1).
  if (currentAssignment) {
    const prevEnd = computePrevEndDate(data.effectiveDate);
    // Guard: prevEnd must be >= currentAssignment.effectiveDate.
    if (prevEnd < new Date(currentAssignment.effectiveDate)) {
      return Response.json({ error: { effectiveDate: 'New effective date is too close to the previous assignment' } }, { status: 422 });
    }
    await EmployeeAssignment.updateOne(
      { _id: currentAssignment._id },
      { $set: { endDate: prevEnd } }
    );
  }

  // 6. Create the new assignment (endDate = null).
  // Snapshot the reference names for history readability.
  const branchName = refs.branch ? refs.branch.name : '';
  const departmentName = refs.department ? refs.department.name : '';
  const designationName = refs.designation ? refs.designation.name : '';

  const newAssignment = await EmployeeAssignment.create({
    employeeId: emp._id,
    branchId: data.branchId || null,
    departmentId: data.departmentId || null,
    designationId: data.designationId || null,
    managerId: data.managerId || null,
    branchName,
    departmentName,
    designationName,
    managerName,
    effectiveDate: new Date(data.effectiveDate),
    endDate: null,
    reason: data.reason || '',
    createdBy: user.id,
  });

  // 7. Update the Employee doc's denormalized fields for V1 compat.
  // Only update if the effectiveDate is today or in the past (immediate effect).
  // Future-dated assignments don't change the current Employee fields yet.
  const effDate = new Date(data.effectiveDate);
  effDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (effDate <= today) {
    if (data.branchId) emp.branchId = data.branchId;
    if (data.departmentId) {
      emp.departmentId = data.departmentId;
      emp.department = departmentName; // V1 string compat
    }
    if (data.designationId) {
      emp.designationId = data.designationId;
      emp.designation = designationName; // V1 string compat
    }
    if (data.managerId !== undefined) emp.managerId = data.managerId || null;
    await emp.save();
  }

  return Response.json(toSafe(newAssignment), { status: 201 });
}
