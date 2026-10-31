// scripts/migrate-v2s4-approval-policy.mjs
// V2 Step 4 — seeds the default V1 approval policy (1 manager stage + 1 HR stage).
// Idempotent — safe to re-run.
//
// Rollback: drop the approvalpolicies collection. V1 requests without routeSnapshot
// continue to use the hardcoded V1 flow.
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

const policySchema = new mongoose.Schema({
  company: String, name: String, effectiveDate: Date, endDate: Date,
  managerStages: Number, finalApproverRole: String, status: String,
}, { timestamps: true });
policySchema.index({ company: 1, endDate: 1 }, { unique: true, partialFilterExpression: { endDate: null } });
const ApprovalPolicy = mongoose.models.ApprovalPolicy || mongoose.model('ApprovalPolicy', policySchema);

const start = Date.now();
console.log(`[migrate-v2s4] Connecting to Atlas ...`);
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
console.log(`[migrate-v2s4] Connected in ${Date.now() - start}ms`);

const existing = await ApprovalPolicy.findOne({ company: COMPANY, endDate: null, status: 'active' });
if (existing) {
  console.log(`[migrate-v2s4] Active policy already exists: ${existing.name} (${existing.managerStages} manager stages, final=${existing.finalApproverRole})`);
  console.log('[migrate-v2s4] Skipping creation.');
} else {
  await ApprovalPolicy.create({
    company: COMPANY,
    name: 'V1 Default (Manager → HR)',
    effectiveDate: new Date('2024-01-01'),
    endDate: null,
    managerStages: 1,
    finalApproverRole: 'hr',
    status: 'active',
  });
  console.log('[migrate-v2s4] Created default V1 policy: 1 manager stage + 1 HR final stage');
}

console.log('');
console.log('========================================');
console.log('  V2 Step 4 approval-policy migration complete');
console.log('========================================');
console.log('Rollback: drop the approvalpolicies collection.');
console.log('========================================');

await mongoose.disconnect();
process.exit(0);
