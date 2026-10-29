// src/app/api/payroll/settings/route.js
// GET  /api/payroll/settings   — view payroll settings (HR/Admin only)
// PATCH /api/payroll/settings  — update settings (HR/Admin only)
//
// V3 Step 1 — smallest payroll boundary. No salary/compensation/tax data.
// Managers have NO access. Employees have NO access (own statements come in a later step).
import { connectDB, PayrollSettings } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { updatePayrollSettingsSchema, validate } from '@/lib/zod-schemas.js';
import { canManagePayroll, toSafeSettings, validateDisplayCurrency } from '@/lib/payroll-engine.js';

const COMPANY = 'FegHR Demo';

export async function GET(request) {
  let user;
  try {
    user = await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json(
      { error: status === 403 ? 'Forbidden — payroll access requires HR/Admin role' : 'Unauthorized' },
      { status }
    );
  }

  await connectDB();

  let settings = await PayrollSettings.findOne({ company: COMPANY }).lean();
  if (!settings) {
    // Auto-create default settings if none exist.
    settings = await PayrollSettings.create({
      company: COMPANY,
      displayCurrency: 'BDT',
      isDemoMode: true,
      enabled: false,
    });
    settings = settings.toObject();
  }

  return Response.json(toSafeSettings(settings));
}

export async function PATCH(request) {
  let user;
  try {
    user = await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json(
      { error: status === 403 ? 'Forbidden — only HR/Admin can manage payroll settings' : 'Unauthorized' },
      { status }
    );
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  const { data, error } = validate(updatePayrollSettingsSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  // Validate display currency if provided.
  if (data.displayCurrency) {
    const curCheck = validateDisplayCurrency(data.displayCurrency);
    if (!curCheck.ok) return Response.json({ error: { displayCurrency: curCheck.error } }, { status: 422 });
    data.displayCurrency = curCheck.value; // normalized to uppercase
  }

  await connectDB();

  let settings = await PayrollSettings.findOne({ company: COMPANY });
  if (!settings) {
    settings = new PayrollSettings({
      company: COMPANY,
      displayCurrency: 'BDT',
      isDemoMode: true,
      enabled: false,
    });
  }

  for (const key of Object.keys(data)) settings[key] = data[key];
  settings.lastUpdatedBy = user.id;
  settings.lastUpdatedByName = user.name || '';
  await settings.save();

  return Response.json(toSafeSettings(settings.toObject()));
}
