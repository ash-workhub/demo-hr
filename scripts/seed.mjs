// scripts/seed.mjs
// Seeds FegHR Demo: creates Employee docs, matching Better Auth user accounts
// (with role + employeeId custom fields), and LeaveBalance for the seed year.
//
// Idempotent: re-running upserts by employee `code` and re-creates Better Auth
// accounts (deletes existing user with the same email first to avoid duplicate-key).
//
// Run: node scripts/seed.mjs
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

// --- load .env.local ---
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

// --- register Mongoose models (mirror src/lib/db/models/*) ---
const employeeSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, index: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
    department: { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true },
    managerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    role: { type: String, enum: ['employee', 'manager', 'hr', 'admin'], default: 'employee', index: true },
    joinDate: { type: Date, required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    avatarColor: { type: String, default: '#6b7280' },
  },
  { timestamps: true }
);
const Employee = mongoose.models.Employee || mongoose.model('Employee', employeeSchema);

const leaveBalanceSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, required: true },
    year: { type: Number, required: true },
    casual: { total: { type: Number, default: 10 }, used: { type: Number, default: 0 } },
    sick: { total: { type: Number, default: 12 }, used: { type: Number, default: 0 } },
    earned: { total: { type: Number, default: 15 }, used: { type: Number, default: 0 } },
    unpaid: { used: { type: Number, default: 0 } },
  },
  { timestamps: true }
);
leaveBalanceSchema.index({ employeeId: 1, year: 1 }, { unique: true });
const LeaveBalance = mongoose.models.LeaveBalance || mongoose.model('LeaveBalance', leaveBalanceSchema);

// --- import seed data (ESM dynamic import of a JS file with no extension-less resolution) ---
const { ORG, DEMO_PASSWORD, SEED_YEAR } = await import('../src/lib/seed/seed-data.js');

// --- use Better Auth directly. We import its core api from a custom in-process config.
//     To avoid duplicating the auth config, we re-create a minimal in-process auth here
//     that shares the same Mongoose connection.
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { MongoClient } from 'mongodb';

const start = Date.now();
console.log(`[seed] Connecting to Atlas ...`);

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
const mongoClient = mongoose.connection.getClient();
const db = mongoClient.db('fegHR');

const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  database: mongodbAdapter(db, { client: mongoClient }),
  emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: false },
  user: {
    additionalFields: {
      role: { type: 'string', required: false, defaultValue: 'employee', input: false },
      employeeId: { type: 'string', required: false, defaultValue: '', input: false },
      active: { type: 'boolean', required: false, defaultValue: true, input: false },
    },
  },
  advanced: {
    database: { generateId: () => new mongoose.Types.ObjectId().toString() },
  },
});

console.log(`[seed] Connected in ${Date.now() - start}ms`);

// Step 1: upsert Employee docs (build code -> _id map for manager linking)
const codeToId = new Map();
const allEmployees = [];

for (const row of ORG) {
  const existing = await Employee.findOne({ employeeId: row.code });
  const doc = existing || new Employee({
    employeeId: row.code,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone || '',
    department: row.department,
    designation: row.designation,
    role: row.role,
    joinDate: new Date(row.joinDate),
    status: 'active',
    avatarColor: row.avatarColor,
  });
  // Keep fields in sync.
  doc.firstName = row.firstName;
  doc.lastName = row.lastName;
  doc.email = row.email;
  doc.phone = row.phone || '';
  doc.department = row.department;
  doc.designation = row.designation;
  doc.role = row.role;
  doc.joinDate = new Date(row.joinDate);
  doc.avatarColor = row.avatarColor;
  doc.status = 'active';
  await doc.save();
  codeToId.set(row.code, doc._id);
  allEmployees.push(doc);
}
console.log(`[seed] Upserted ${allEmployees.length} Employee docs`);

// Step 2: link managers
for (const row of ORG) {
  if (!row.managerCode) continue;
  const empId = codeToId.get(row.code);
  const mgrId = codeToId.get(row.managerCode);
  if (!mgrId) {
    console.warn(`[seed] WARN: manager code ${row.managerCode} not found for ${row.code}`);
    continue;
  }
  await Employee.updateOne({ _id: empId }, { $set: { managerId: mgrId } });
}
console.log(`[seed] Linked manager relationships`);

// Step 3: upsert LeaveBalance for seed year
for (const emp of allEmployees) {
  await LeaveBalance.findOneAndUpdate(
    { employeeId: emp._id, year: SEED_YEAR },
    {
      $setOnInsert: {
        casual: { total: 10, used: 0 },
        sick: { total: 12, used: 0 },
        earned: { total: 15, used: 0 },
        unpaid: { used: 0 },
      },
    },
    { upsert: true, new: true }
  );
}
console.log(`[seed] Ensured LeaveBalance for year ${SEED_YEAR}`);

// Step 4: create Better Auth user accounts (delete existing first to allow re-seed)
// We use Better Auth's internal signUpEmail API so password hashing matches production.
let created = 0, skipped = 0;
for (const row of ORG) {
  const empId = codeToId.get(row.code);

  // Delete any pre-existing user/account docs with this email so re-seed works.
  // account docs key off `userId`, not `email` — so delete accounts first by
  // looking up the existing user's _id, then delete the user.
  const existingUser = await db.collection('user').findOne({ email: row.email });
  if (existingUser) {
    await db.collection('account').deleteMany({ userId: existingUser._id });
    await db.collection('session').deleteMany({ userId: existingUser._id });
    await db.collection('user').deleteOne({ _id: existingUser._id });
  }

  try {
    // Server-side signup. autoSignIn=false means no session cookie returned (we don't want one).
    const res = await auth.api.signUpEmail({
      body: {
        email: row.email,
        password: DEMO_PASSWORD,
        name: `${row.firstName} ${row.lastName}`,
      },
    });
    const userId = res?.user?.id;
    if (!userId) throw new Error('signUpEmail returned no user id');

    // Patch the user with our custom fields (Better Auth additionalFields with input:false
    // means the client can't set them, but we can write directly).
    // Note: Better Auth stores _id as a STRING (per our generateId config), so don't cast.
    await db.collection('user').updateOne(
      { _id: userId },
      { $set: { role: row.role, employeeId: empId.toString(), active: true } }
    );
    created++;
  } catch (e) {
    console.error(`[seed] FAIL creating user for ${row.email}: ${e.message}`);
    skipped++;
  }
}

console.log(`[seed] Better Auth accounts: ${created} created, ${skipped} skipped`);
console.log('');
console.log('========================================');
console.log('  FegHR Demo — seed complete');
console.log('========================================');
console.log(`Employees:    ${allEmployees.length}`);
console.log(`Year:         ${SEED_YEAR}`);
console.log(`Password:     ${DEMO_PASSWORD}  (all demo accounts)`);
console.log('');
console.log('Demo accounts:');
for (const row of ORG) {
  console.log(`  ${row.role.padEnd(8)} ${row.email.padEnd(28)} (${row.code} — ${row.firstName} ${row.lastName})`);
}
console.log('========================================');

await mongoose.disconnect();
process.exit(0);
