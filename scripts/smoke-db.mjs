// scripts/smoke-db.mjs
// Proves the Mongoose data layer works against Atlas.
// Creates one Employee, reads it back, lists collections, then deletes the test doc.
// Run: node scripts/smoke-db.mjs
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

// Load .env.local manually (Next.js convention; no dotenv dep needed).
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

// Register models on the mongoose instance.
const employeeSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, default: '' },
    department: { type: String, required: true },
    designation: { type: String, required: true },
    managerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    role: { type: String, enum: ['employee', 'manager', 'hr', 'admin'], default: 'employee' },
    joinDate: { type: Date, required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    avatarColor: { type: String, default: '#6b7280' },
  },
  { timestamps: true }
);
const Employee = mongoose.models.Employee || mongoose.model('Employee', employeeSchema);

const TEST_ID = 'FEG-SMOKE-001';
const TEST_EMAIL = 'smoke-test@feghr.demo';

const start = Date.now();
let createdId = null;
try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log(`[smoke] Connected in ${Date.now() - start}ms`);

  // Clean any leftover from a previous failed run.
  await Employee.deleteOne({ employeeId: TEST_ID });

  // Create.
  const created = await Employee.create({
    employeeId: TEST_ID,
    firstName: 'Smoke',
    lastName: 'Test',
    email: TEST_EMAIL,
    department: 'QA',
    designation: 'Smoke Tester',
    joinDate: new Date(),
    role: 'employee',
    avatarColor: '#10b981',
  });
  createdId = created._id;
  console.log(`[smoke] Created: ${created.employeeId} (${created._id})`);

  // Read.
  const found = await Employee.findOne({ employeeId: TEST_ID });
  if (!found) throw new Error('read-back failed: not found');
  if (found.email !== TEST_EMAIL) throw new Error(`email mismatch: ${found.email}`);
  console.log(`[smoke] Read back: ${found.employeeId} / ${found.email} / role=${found.role}`);

  // List all collections in db.
  const cols = await mongoose.connection.db.listCollections().toArray();
  console.log(`[smoke] Collections in db: [${cols.map(c => c.name).join(', ')}]`);

  // Cleanup.
  await Employee.deleteOne({ _id: createdId });
  console.log(`[smoke] Cleaned up test doc`);

  console.log(`[smoke] OK — data layer operational (${Date.now() - start}ms total)`);
  await mongoose.disconnect();
  process.exit(0);
} catch (err) {
  console.error(`[smoke] FAIL: ${err.name}: ${err.message}`);
  if (createdId) {
    try { await Employee.deleteOne({ _id: createdId }); } catch {}
  }
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
}
