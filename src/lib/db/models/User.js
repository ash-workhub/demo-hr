// src/lib/db/models/User.js
// Read-only Mongoose view over Better Auth's `user` collection.
// Better Auth owns writes; we use this for server-side joins/lookups only.
// `strict: false` so unknown Better Auth fields don't break reads.
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    email: { type: String, required: true, lowercase: true, index: true },
    emailVerified: { type: Boolean, default: false },
    image: { type: String, default: '' },
    // Custom fields added via Better Auth config:
    role: { type: String, enum: ['employee', 'manager', 'hr', 'admin'], default: 'employee', index: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null, index: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, strict: false, collection: 'user' }
);

export default mongoose.models.User || mongoose.model('User', userSchema);
