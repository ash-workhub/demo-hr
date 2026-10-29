// src/lib/db/models/PayrollSettings.js
// Company-level demo payroll settings. V3 Step 1 — additive.
// Stores a configurable display-currency label and explicit demo calculation flags.
// Does NOT infer BDT or any legal jurisdiction from the timezone.
// No compensation, payroll formulas, taxes, bank details, or external integrations.
import mongoose from 'mongoose';

const payrollSettingsSchema = new mongoose.Schema(
  {
    company: { type: String, required: true, default: 'FegHR Demo', unique: true },
    // Display currency label — purely cosmetic (e.g., "BDT", "USD", "EUR").
    // NOT inferred from timezone. HR/Admin sets this explicitly.
    displayCurrency: { type: String, default: 'BDT', trim: true, maxlength: 10 },
    // Explicit demo-mode flag: all payroll numbers are fictional.
    isDemoMode: { type: Boolean, default: true },
    // Whether payroll module is enabled at all (feature flag).
    enabled: { type: Boolean, default: false },
    // Who last updated settings (audit).
    lastUpdatedBy: { type: String, default: '' },
    lastUpdatedByName: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.models.PayrollSettings || mongoose.model('PayrollSettings', payrollSettingsSchema);
