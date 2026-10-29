// scripts/migrate-v2s3-leave-types.mjs
// V2 Step 3 — additive migration. Seeds LeaveType reference records from the
// hardcoded V1 enum (casual/sick/earned/unpaid). Idempotent.
//
// NO V1 data is deleted or overwritten. The LeaveBalance and LeaveRequest
// collections are untouched. This only creates LeaveType docs.
//
// Run: node scripts/migrate-v2s3-leave-types.mjs
//
// Rollback:
//   Drop the leavetypes collection. V1 behavior is fully restored — the
//   hardcoded LEAVE_TYPES enum still works.
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

const leaveTypeSchema = new mongoose.Schema({
  company: String, code: String, name: String, isUnlimited: Boolean,
  defaultQuota: Number, requiresDocumentation: Boolean, status: String,
}, { timestamps: true });
leaveTypeSchema.index({ company: 1, code: 1 }, { unique: true });
const LeaveType = mongoose.models.LeaveType || mongoose.model('LeaveType', leaveTypeSchema);

const SEED_TYPES = [
  { code: 'casual', name: 'Casual Leave', isUnlimited: false, defaultQuota: 10, requiresDocumentation: false },
  { code: 'sick', name: 'Sick Leave', isUnlimited: false, defaultQuota: 12, requiresDocumentation: false },
  { code: 'earned', name: 'Earned Leave', isUnlimited: false, defaultQuota: 15, requiresDocumentation: false },
  { code: 'unpaid', name: 'Unpaid Leave', isUnlimited: true, defaultQuota: 0, requiresDocumentation: false },
];

const start = Date.now();
console.log(`[migrate-v2s3] Connecting to Atlas ...`);
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
console.log(`[migrate-v2s3] Connected in ${Date.now() - start}ms`);

let created = 0, skipped = 0;
for (const t of SEED_TYPES) {
  const existing = await LeaveType.findOne({ company: COMPANY, code: t.code });
  if (existing) {
    console.log(`  Skip (exists): ${t.code}`);
    skipped++;
    continue;
  }
  await LeaveType.create({ ...t, company: COMPANY, status: 'active' });
  console.log(`  Created: ${t.code} = ${t.name} (isUnlimited=${t.isUnlimited}, quota=${t.defaultQuota})`);
  created++;
}

console.log('');
console.log('========================================');
console.log('  V2 Step 3 leave-types migration complete');
console.log('========================================');
console.log(`Created: ${created}  |  Skipped (already existed): ${skipped}`);
console.log(`Time: ${Date.now() - start}ms`);
console.log('');
console.log('Rollback: drop the leavetypes collection.');
console.log('========================================');

await mongoose.disconnect();
process.exit(0);
