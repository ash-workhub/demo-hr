// src/lib/db/models/User.js
// Read-only Mongoose view over Better Auth's `user` collection.
// Better Auth owns writes; we use this for server-side joins/lookups only.
// `strict: false` so unknown Better Auth fields don't break reads.
//
// IMPORTANT: `employeeId` is stored as a STRING (not ObjectId) because Better Auth's
// additionalFields config stores it as a string. Declaring it as ObjectId here would
// cause Mongoose to cast query values to ObjectId — which wouldn't match the stored
// string. So we use `String` and cast to string when querying from ObjectId sources.
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    email: { type: String, required: true, lowercase: true, index: true },
    emailVerified: { type: Boolean, default: false },
    image: { type: String, default: '' },
    // Custom fields added via Better Auth config (stored as strings):
    role: { type: String, enum: ['employee', 'manager', 'hr', 'admin'], default: 'employee', index: true },
    employeeId: { type: String, default: '', index: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, strict: false, collection: 'user' }
);

export default mongoose.models.User || mongoose.model('User', userSchema);

