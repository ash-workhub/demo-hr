// src/app/api/payroll/compensation/[employeeId]/route.js
// GET /api/payroll/compensation/:employeeId — full compensation history for one employee.
//   HR/Admin: any employee.
//   Employee: own record only (visibility rule: see only their own compensation).
//   Manager: NO access (no salary access at all).
import { connectDB, CompensationRecord, Employee, PayrollSettings } from '@/lib/db/index.js';
import { requireUser, getSessionEmployee } from '@/lib/auth-helpers.js';
import { toSafeCompensation } from '@/lib/compensation-engine.js';

const COMPANY = 'FegHR Demo';

export async function GET(request, { params }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { employeeId } = await params;
  await connectDB();

  // Authorization:
  // - HR/Admin: can view any employee's compensation
  // - Employee: can view ONLY their own (employeeId must match session employeeId)
  // - Manager: NO access at all
  if (user.role === 'manager') {
    return Response.json(
      { error: 'Forbidden — managers have no compensation access' },
      { status: 403 }
    );
  }

  if (user.role === 'employee') {
    const me = await getSessionEmployee();
    if (!me || me._id.toString() !== employeeId) {
      return Response.json(
        { error: 'Forbidden — you can only view your own compensation' },
        { status: 403 }
      );
    }
  }

  const target = await Employee.findById(employeeId).lean();
  if (!target) return Response.json({ error: 'Employee not found' }, { status: 404 });

  const records = await CompensationRecord.find({
    employeeId: target._id,
    company: COMPANY,
  }).sort({ effectiveDate: 1 }).lean();

  // Get display currency.
  const settings = await PayrollSettings.findOne({ company: COMPANY }).lean();
  const currency = settings?.displayCurrency || 'BDT';

  return Response.json({
    employee: {
      id: target._id.toString(),
      fullName: `${target.firstName} ${target.lastName}`,
      employeeCode: target.employeeId,
    },
    history: records.map((r) => toSafeCompensation(r, currency)),
  });
}
