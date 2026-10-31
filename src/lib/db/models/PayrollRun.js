// src/lib/db/models/PayrollRun.js
// One Draft payroll run per company/calendar month. V3 Step 4 — additive.
//
// Each run contains immutable line snapshots — generated once from the then-current
// employee/compensation/attendance/leave data. Lines are never recomputed from
// mutable data. The run is idempotent: duplicate generation requests for the same
// (company, year, month) return the existing run, never duplicate lines or totals.
//
// Status lifecycle: draft → locked (lock enabled in a later step).
// No tax/bank/payment/export fields.
import mongoose from 'mongoose';

const RUN_STATUS = ['draft', 'locked'];

const allowanceSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    amount: { type: Number, required: true, integer: true }, // paisa
  },
  { _id: false }
);

const lineSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    // --- Snapshot of employee display fields (immutable at generation time) ---
    employeeCode: { type: String, required: true },
    employeeName: { type: String, required: true },
    department: { type: String, default: '' },
    designation: { type: String, default: '' },
    // --- Snapshot of effective compensation components ---
    basePay: { type: Number, required: true, integer: true }, // paisa
    allowances: { type: [allowanceSnapshotSchema], default: [] },
    grossPay: { type: Number, required: true, integer: true }, // monthly gross (paisa)
    compensationEffectiveDate: { type: Date, required: true },
    // --- Calculation settings/version snapshot ---
    calcMode: { type: String, enum: ['FULL_MONTH', 'PRORATED'], required: true },
    calcVersion: { type: String, default: 'v3-step3' }, // engine version
    displayCurrency: { type: String, default: 'BDT' },
    // --- Source day counts (if PRORATED) ---
    calendarDays: { type: Number, default: 0 },
    payableDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    unpaidLeaveDays: { type: Number, default: 0 },
    paidLeaveDays: { type: Number, default: 0 },
    ambiguousDays: { type: Number, default: 0 },
    // --- Illustrative gross (the computed result) ---
    illustrativeGross: { type: Number, required: true, integer: true }, // paisa
    // --- Generation audit ---
    generatedBy: { type: String, required: true }, // user id
    generatedByName: { type: String, default: '' },
    generatedAt: { type: Date, default: Date.now },
    // --- Limitations from calculation ---
    limitations: { type: [String], default: [] },
  },
  { _id: false }
);

const runSchema = new mongoose.Schema(
  {
    company: { type: String, required: true, default: 'FegHR Demo', index: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    status: { type: String, enum: RUN_STATUS, default: 'draft', index: true },
    // Immutable lines (snapshots).
    lines: { type: [lineSchema], default: [] },
    // Totals (sum of all lines).
    totalBasePay: { type: Number, default: 0, integer: true },
    totalGrossPay: { type: Number, default: 0, integer: true },
    totalIllustrativeGross: { type: Number, default: 0, integer: true },
    // Generation audit.
    generatedBy: { type: String, required: true },
    generatedByName: { type: String, default: '' },
    generatedAt: { type: Date, default: Date.now },
    // Calculation settings used for this run.
    calcMode: { type: String, enum: ['FULL_MONTH', 'PRORATED'], required: true, default: 'FULL_MONTH' },
    calcVersion: { type: String, default: 'v3-step3' },
    displayCurrency: { type: String, default: 'BDT' },
  },
  { timestamps: true }
);

// Idempotency: one run per (company, year, month).
runSchema.index({ company: 1, year: 1, month: 1 }, { unique: true });

export default mongoose.models.PayrollRun || mongoose.model('PayrollRun', runSchema);
export { RUN_STATUS };
