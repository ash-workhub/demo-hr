// scripts/migrate-v3s1-payroll-settings.mjs
// V3 Step 1 — additive migration. Creates default PayrollSettings for FegHR Demo.
// Idempotent — safe to re-run.
//
// Rollback: drop the payrollsettings collection. V1/V2 behavior is fully restored
// (no payroll code existed before V3).
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const COMPANY = 'FegHR Demo';

const schema = new mongoose.Schema({
  company: { type: String, required: true, unique: true },
  displayCurrency: { type: String, default: 'BDT' },
  isDemoMode: { type: Boolean, default: true },
  enabled: { type: Boolean, default: false },
  lastUpdatedBy: { type: String, default: '' },
  lastUpdatedByName: { type: String, default: '' },
}, { timestamps: true });
const PayrollSettings = mongoose.models.PayrollSettings || mongoose.model('PayrollSettings', schema);

const start = Date.now();
console.log(`[migrate-v3s1] Connecting to Atlas ...`);
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
console.log(`[migrate-v3s1] Connected in ${Date.now() - start}ms`);

const existing = await PayrollSettings.findOne({ company: COMPANY });
if (existing) {
  console.log(`[migrate-v3s1] Settings already exist: currency=${existing.displayCurrency} demo=${existing.isDemoMode} enabled=${existing.enabled}`);
  console.log('[migrate-v3s1] Skipping creation.');
} else {
  await PayrollSettings.create({
    company: COMPANY,
    displayCurrency: 'BDT',
    isDemoMode: true,
    enabled: false,
  });
  console.log('[migrate-v3s1] Created default payroll settings: currency=BDT, demoMode=true, enabled=false');
}

console.log('');
console.log('========================================');
console.log('  V3 Step 1 payroll-settings migration complete');
console.log('========================================');
console.log('Rollback: drop the payrollsettings collection.');
console.log('========================================');

await mongoose.disconnect();
process.exit(0);
