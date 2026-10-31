// src/lib/db/models/CompanyNotice.js
// Company-scoped in-app notice with draft/publish/archive lifecycle.
// V2 Step 5 — additive. No external email/SMS/push.
import mongoose from 'mongoose';

const NOTICE_STATUS = ['draft', 'published', 'archived'];
const AUDIENCE_ROLES = ['employee', 'manager', 'hr', 'admin'];

const noticeSchema = new mongoose.Schema(
  {
    company: { type: String, required: true, default: 'FegHR Demo', index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    // Which roles can see this notice when published.
    audienceRoles: { type: [String], enum: AUDIENCE_ROLES, default: ['employee', 'manager', 'hr', 'admin'] },
    status: { type: String, enum: NOTICE_STATUS, default: 'draft', index: true },
    // Author audit.
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, default: '' },
    // Publication audit.
    publishedAt: { type: Date, default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedByName: { type: String, default: '' },
    // Archive audit.
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    archivedByName: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.models.CompanyNotice || mongoose.model('CompanyNotice', noticeSchema);
export { NOTICE_STATUS, AUDIENCE_ROLES };
