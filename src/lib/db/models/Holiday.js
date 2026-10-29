// src/lib/db/models/Holiday.js
// Company-scoped holiday. V2 Step 2 — additive.
import mongoose from 'mongoose';

const holidaySchema = new mongoose.Schema(
  {
    company: { type: String, required: true, default: 'FegHR Demo', index: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD (Asia/Dhaka)
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['national', 'religious', 'company'], default: 'company' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  },
  { timestamps: true }
);

// Unique holiday per (company, date).
holidaySchema.index({ company: 1, date: 1 }, { unique: true });

export default mongoose.models.Holiday || mongoose.model('Holiday', holidaySchema);
