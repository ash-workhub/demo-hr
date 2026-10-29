// src/app/api/payroll/compensation/route.js
// GET  /api/payroll/compensation          — list current compensation for all employees (HR/Admin)
// GET  /api/payroll/compensation?all=true — list all historical records (HR/Admin)
// POST /api/payroll/compensation          — create new effective-dated compensation (HR/Admin)
//
// V3 Step 2 — effective-dated fictional monthly compensation.
// Managers: NO access. Employees: NO access (own view in later step).
// Compensation is kept out of the general employee directory and all non-payroll reports.
import { connectDB, CompensationRecord, Employee, PayrollSettings } from '@/lib/db/index.js';
import { requireRole, getSessionEmployee } from '@/lib/auth-helpers.js';
import { createCompensationSchema, validate } from '@/lib/zod-schemas.js';
import {
  computeGrossPay,
  validateCompensation,
  computePrevEndDate,
  toSafeCompensation,
} from '@/lib/compensation-engine.js';

const COMPANY = 'FegHR Demo';

export async function GET(request) {
  let user;
  try {
    user = await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json(
      { error: status === 403 ? 'Forbidden — compensation access requires HR/Admin role' : 'Unauthorized' },
      { status }
    );
  }

  await connectDB();

  // Get display currency from settings.
  const settings = await PayrollSettings.findOne({ company: COMPANY }).lean();
  const currency = settings?.displayCurrency || 'BDT';

  const { searchParams } = new URL(request.url);
  const all = searchParams.get('all') === 'true';

  let filter = { company: COMPANY };
  if (!all) filter.endDate = null; // current records only

  const records = await CompensationRecord.find(filter)
    .sort({ effectiveDate: -1 })
    .limit(500)
    .lean();

  // Batch-load employee names.
  const empIds = [...new Set(records.map((r) => r.employeeId?.toString()).filter(Boolean))];
  const employees = await Employee.find({ _id: { $in: empIds } }).lean();
  const empMap = new Map(employees.map((e) => [e._id.toString(), e]));

  return Response.json({
    items: records.map((r) => {
      const safe = toSafeCompensation(r, currency);
      const emp = empMap.get(r.employeeId?.toString());
      safe.employeeName = emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown';
      safe.employeeCode = emp?.employeeId || '';
      return safe;
    }),
  });
}

export async function POST(request) {
  let user;
  try {
    user = await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json(
      { error: status === 403 ? 'Forbidden — only HR/Admin can manage compensation' : 'Unauthorized' },
      { status }
    );
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  const { data, error } = validate(createCompensationSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  await connectDB();

  // Validate employee exists + is active.
  const emp = await Employee.findById(data.employeeId);
  if (!emp) return Response.json({ error: { employeeId: 'Employee not found' } }, { status: 422 });
  if (emp.status !== 'active') {
    return Response.json({ error: { employeeId: 'Employee is not active' } }, { status: 422 });
  }

  // Find current compensation record (if any) to check effective date ordering.
  const currentRecord = await CompensationRecord.findOne({
    employeeId: emp._id,
    endDate: null,
  }).lean();

  // Validate compensation data (effective date, base pay, allowances).
  const validation = validateCompensation(
    data,
    currentRecord?.effectiveDate,
    emp.joinDate
  );
  if (!validation.ok) {
    return Response.json({ error: { _: validation.error } }, { status: 422 });
  }

  // Compute gross pay.
  const grossPay = computeGrossPay(data.basePay, data.allowances);

  // Close the current record (set endDate = newEffectiveDate - 1).
  if (currentRecord) {
    const prevEnd = computePrevEndDate(data.effectiveDate);
    if (prevEnd < new Date(currentRecord.effectiveDate)) {
      return Response.json({
        error: { effectiveDate: 'New effective date is too close to the previous record' },
      }, { status: 422 });
    }
    await CompensationRecord.updateOne(
      { _id: currentRecord._id },
      {
        $set: { endDate: prevEnd },
        $push: {
          history: {
            action: 'superseded',
            by: user.id,
            byName: user.name || '',
            byRole: user.role,
            note: `Superseded by new record effective ${new Date(data.effectiveDate).toLocaleDateString('en-GB')}`,
            at: new Date(),
          },
        },
      }
    );
  }

  // Create the new compensation record.
  const newRecord = await CompensationRecord.create({
    employeeId: emp._id,
    company: COMPANY,
    basePay: data.basePay,
    allowances: (data.allowances || []).map((a) => ({
      name: a.name.trim(),
      amount: a.amount,
    })),
    grossPay,
    effectiveDate: new Date(data.effectiveDate),
    endDate: null,
    history: [{
      action: 'created',
      by: user.id,
      byName: user.name || '',
      byRole: user.role,
      note: data.note || '',
      at: new Date(),
    }],
  });

  // Get currency for display.
  const settings = await PayrollSettings.findOne({ company: COMPANY }).lean();
  const currency = settings?.displayCurrency || 'BDT';

  return Response.json(toSafeCompensation(newRecord.toObject(), currency), { status: 201 });
}
