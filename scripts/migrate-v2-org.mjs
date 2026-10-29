// scripts/migrate-v2-org.mjs
// V2 Step 1 — additive migration. Creates Branch/Department/Designation reference
// records from existing V1 Employee strings, back-fills Employee.departmentId /
// Employee.designationId, and creates an initial EmployeeAssignment per employee
// (effectiveDate = joinDate).
//
// Idempotent: re-running is safe. It checks for existing records by (company, code)
// before creating, and only creates assignments for employees who don't have one.
//
// NO V1 data is deleted or overwritten. The Employee.department/designation strings
// are preserved (they already match the reference record names by construction).
//
// Run: node scripts/migrate-v2-org.mjs
//
// Rollback:
//   This migration is purely additive. To roll back:
//     1. Delete the new collections (branches, departments, designations, employeeassignments)
//     2. Unset the new fields on Employee docs:
//          db.employees.updateMany({}, { $unset: { branchId: "", departmentId: "", designationId: "" } })
//     3. V1 behavior is fully restored — the Employee.department/designation strings
//        and managerId refs are untouched.
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

// Load .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const COMPANY = 'FegHR Demo';

// --- Register models (mirror src/lib/db/models/*) ---
const employeeSchema = new mongoose.Schema({
  employeeId: String, firstName: String, lastName: String, email: String,
  department: String, designation: String,
  branchId: { type: mongoose.Schema.Types.ObjectId, default: null },
  departmentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  designationId: { type: mongoose.Schema.Types.ObjectId, default: null },
  managerId: { type: mongoose.Schema.Types.ObjectId, default: null },
  role: String, joinDate: Date, status: String,
}, { timestamps: true });
const Employee = mongoose.models.Employee || mongoose.model('Employee', employeeSchema);

const branchSchema = new mongoose.Schema({
  company: String, code: String, name: String, address: String, status: String,
}, { timestamps: true });
branchSchema.index({ company: 1, code: 1 }, { unique: true });
branchSchema.index({ company: 1, name: 1 }, { unique: true });
const Branch = mongoose.models.Branch || mongoose.model('Branch', branchSchema);

const departmentSchema = new mongoose.Schema({
  company: String, code: String, name: String, branchId: mongoose.Schema.Types.ObjectId, status: String,
}, { timestamps: true });
departmentSchema.index({ company: 1, code: 1 }, { unique: true });
departmentSchema.index({ company: 1, name: 1 }, { unique: true });
const Department = mongoose.models.Department || mongoose.model('Department', departmentSchema);

const designationSchema = new mongoose.Schema({
  company: String, code: String, name: String, departmentId: mongoose.Schema.Types.ObjectId, status: String,
}, { timestamps: true });
designationSchema.index({ company: 1, code: 1 }, { unique: true });
designationSchema.index({ company: 1, name: 1 }, { unique: true });
const Designation = mongoose.models.Designation || mongoose.model('Designation', designationSchema);

const assignmentSchema = new mongoose.Schema({
  employeeId: mongoose.Schema.Types.ObjectId,
  branchId: mongoose.Schema.Types.ObjectId, departmentId: mongoose.Schema.Types.ObjectId,
  designationId: mongoose.Schema.Types.ObjectId, managerId: mongoose.Schema.Types.ObjectId,
  branchName: String, departmentName: String, designationName: String, managerName: String,
  effectiveDate: Date, endDate: Date, reason: String, createdBy: String,
}, { timestamps: true });
assignmentSchema.index({ employeeId: 1, effectiveDate: 1 });
assignmentSchema.index({ employeeId: 1, endDate: 1 }, { unique: true, partialFilterExpression: { endDate: null } });
const EmployeeAssignment = mongoose.models.EmployeeAssignment || mongoose.model('EmployeeAssignment', assignmentSchema);

// --- Migration helpers ---
function genCode(name, prefix) {
  // Generate a code from a name: take first letters of words, uppercase, prefix with type.
  // E.g., "Engineering" -> "DEPT-ENG", "Junior Engineer" -> "DES-JUE"
  const letters = name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 4);
  return `${prefix}-${letters}`;
}

async function findOrCreateRef(Model, code, name, extra = {}) {
  let doc = await Model.findOne({ company: COMPANY, code });
  if (doc) return doc;
  try {
    doc = await Model.create({ company: COMPANY, code, name, status: 'active', ...extra });
    return doc;
  } catch (e) {
    if (e.code === 11000) {
      // Name collision — append a suffix to the code.
      const suffix = Math.floor(Math.random() * 90 + 10);
      return findOrCreateRef(Model, `${code}${suffix}`, name, extra);
    }
    throw e;
  }
}

// --- Main migration ---
const start = Date.now();
console.log(`[migrate-v2-org] Connecting to Atlas ...`);
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
console.log(`[migrate-v2-org] Connected in ${Date.now() - start}ms`);

const employees = await Employee.find({}).lean();
console.log(`[migrate-v2-org] Found ${employees.length} employees`);

// Step 1: Create Department reference records from existing strings.
const deptNames = [...new Set(employees.map((e) => e.department))];
console.log(`[migrate-v2-org] Creating ${deptNames.length} Department reference records...`);
const deptMap = new Map(); // name -> doc
for (const name of deptNames) {
  const code = genCode(name, 'DEPT');
  const doc = await findOrCreateRef(Department, code, name);
  deptMap.set(name, doc);
  console.log(`  Department: ${doc.code} = ${doc.name} (${doc._id})`);
}

// Step 2: Create Designation reference records from existing strings.
const desigNames = [...new Set(employees.map((e) => e.designation))];
console.log(`[migrate-v2-org] Creating ${desigNames.length} Designation reference records...`);
const desigMap = new Map();
for (const name of desigNames) {
  const code = genCode(name, 'DES');
  // Try to link to a department by matching the employee's department.
  const sampleEmp = employees.find((e) => e.designation === name);
  const deptDoc = sampleEmp ? deptMap.get(sampleEmp.department) : null;
  const doc = await findOrCreateRef(Designation, code, name, { departmentId: deptDoc ? deptDoc._id : null });
  desigMap.set(name, doc);
  console.log(`  Designation: ${doc.code} = ${doc.name} (${doc._id})`);
}

// Step 3: Back-fill Employee.departmentId + designationId.
console.log(`[migrate-v2-org] Back-filling Employee refs...`);
let updated = 0;
for (const emp of employees) {
  const deptDoc = deptMap.get(emp.department);
  const desigDoc = desigMap.get(emp.designation);
  if (deptDoc || desigDoc) {
    const set = {};
    if (deptDoc && !emp.departmentId) set.departmentId = deptDoc._id;
    if (desigDoc && !emp.designationId) set.designationId = desigDoc._id;
    if (Object.keys(set).length > 0) {
      await Employee.updateOne({ _id: emp._id }, { $set: set });
      updated++;
    }
  }
}
console.log(`[migrate-v2-org] Updated ${updated} employees with ref IDs`);

// Step 4: Create initial EmployeeAssignment for each employee (if none exists).
console.log(`[migrate-v2-org] Creating initial assignments...`);
let assignmentsCreated = 0;
for (const emp of employees) {
  const existing = await EmployeeAssignment.findOne({ employeeId: emp._id }).lean();
  if (existing) {
    continue; // skip — already has history
  }
  const deptDoc = deptMap.get(emp.department);
  const desigDoc = desigMap.get(emp.designation);
  // Look up the manager's name for the snapshot.
  let managerName = '';
  if (emp.managerId) {
    const mgr = await Employee.findById(emp.managerId).lean();
    if (mgr) managerName = `${mgr.firstName} ${mgr.lastName}`;
  }
  await EmployeeAssignment.create({
    employeeId: emp._id,
    branchId: null, // V1 had no branch concept
    departmentId: deptDoc ? deptDoc._id : null,
    designationId: desigDoc ? desigDoc._id : null,
    managerId: emp.managerId || null,
    branchName: '',
    departmentName: emp.department,
    designationName: emp.designation,
    managerName,
    effectiveDate: emp.joinDate,
    endDate: null, // current
    reason: 'Initial assignment (V2 migration)',
    createdBy: 'migration',
  });
  assignmentsCreated++;
}
console.log(`[migrate-v2-org] Created ${assignmentsCreated} initial assignments`);

console.log('');
console.log('========================================');
console.log('  V2 Step 1 migration complete');
console.log('========================================');
console.log(`Departments created:        ${deptMap.size}`);
console.log(`Designations created:       ${desigMap.size}`);
console.log(`Employees updated with refs: ${updated}`);
console.log(`Initial assignments created: ${assignmentsCreated}`);
console.log(`Total time:                 ${Date.now() - start}ms`);
console.log('');
console.log('Rollback (if needed):');
console.log('  1. Drop collections: branches, departments, designations, employeeassignments');
console.log('  2. db.employees.updateMany({}, { $unset: { branchId: "", departmentId: "", designationId: "" } })');
console.log('  3. V1 behavior is fully restored (string fields + managerId untouched)');
console.log('========================================');

await mongoose.disconnect();
process.exit(0);
