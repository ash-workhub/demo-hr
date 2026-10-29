// src/lib/db/models/NoticeReadState.js
// Per-recipient read state for company notices.
// V2 Step 5 — additive. One read record per user per notice.
import mongoose from 'mongoose';

const readStateSchema = new mongoose.Schema(
  {
    noticeId: { type: mongoose.Schema.Types.ObjectId, ref: 'CompanyNotice', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    readAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One read state per (noticeId, userId).
readStateSchema.index({ noticeId: 1, userId: 1 }, { unique: true });

export default mongoose.models.NoticeReadState || mongoose.model('NoticeReadState', readStateSchema);
