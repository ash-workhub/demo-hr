// src/lib/db/models/CompensationRecord.js
// Effective-dated fictional monthly compensation for active employees.
// V3 Step 2 — additive. No bank/payment/tax/benefit/loan fields.
//
// Structure: basePay (integer paisa) + optional named allowances[].
// Gross = basePay + sum(allowances.amount). All amounts in integer paisa
// (1 BDT = 100 paisa) to avoid floating-point errors. Display layer divides by 100.
//
// One active record per employee at a time (endDate=null). Previous records
// are preserved with endDate set — never overwritten or deleted.
// Every change creates a new record + an audit event in history[].
import mongoose from 'mongoose';

const allowanceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    amount: { type: Number, required: true, min: 0, integer: true }, // paisa (integer)
  },
  { _id: false }
);

const auditEventSchema = new mongoose.Schema(
  {
    action: { type: String, enum: ['created', 'superseded'], required: true },
    by: { type: String, required: true }, // user id
    byName: { type: String, default: '' },
    byRole: { type: String, enum: ['hr', 'admin'], required: true },
    note: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const compensationSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    company: { type: String, required: true, default: 'FegHR Demo', index: true },
    // Monthly base pay in integer paisa (e.g., 50000 BDT = 5000000 paisa).
    basePay: { type: Number, required: true, min: 0, integer: true },
    // Optional named allowances (e.g., house rent, transport, medical).
    allowances: { type: [allowanceSchema], default: [] },
    // Derived gross = basePay + sum(allowances.amount). Stored for query convenience;
    // the engine recomputes it to verify consistency.
    grossPay: { type: Number, required: true, min: 0, integer: true },
    // Effective-dated: one active record per employee (endDate=null).
    effectiveDate: { type: Date, required: true, index: true },
    endDate: { type: Date, default: null, index: true },
    // Audit trail for this record.
    history: { type: [auditEventSchema], default: [] },
  },
  { timestamps: true }
);

// One active (endDate=null) compensation per employee.
compensationSchema.index(
  { employeeId: 1, endDate: 1 },
  { unique: true, partialFilterExpression: { endDate: null } }
);

// Prevent overlapping records: one record per (employeeId, effectiveDate).
compensationSchema.index({ employeeId: 1, effectiveDate: 1 }, { unique: true });

export default mongoose.models.CompensationRecord || mongoose.model('CompensationRecord', compensationSchema);
