// src/lib/auth.js
// Better Auth configuration with the MongoDB adapter.
// Custom user fields: `role` and `employeeId` (ObjectId hex string of linked Employee doc).
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;
const AUTH_SECRET = process.env.BETTER_AUTH_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

if (!MONGODB_URI) throw new Error('MONGODB_URI missing in env');
if (!AUTH_SECRET) throw new Error('BETTER_AUTH_SECRET missing in env');

// Dedicated MongoClient for Better Auth. `new MongoClient()` does NOT do any I/O;
// the connection is established lazily on first operation. We pass `db` (a reference,
// also no I/O) and `client` to the adapter at module-load. Atlas M0 supports plenty
// of connections, so a separate pool from Mongoose's is fine for the prototype.
const authClient = new MongoClient(MONGODB_URI, {
  serverSelectionTimeoutMS: 15000,
});
const authDb = authClient.db('fegHR');

export { authClient, authDb };

export const auth = betterAuth({
  secret: AUTH_SECRET,
  baseURL: APP_URL,
  // Trust the app URL plus the sandbox preview domain (preview-*.space-z.ai)
  // so sign-in/sign-out work from the preview panel, not just localhost.
  // Better Auth supports glob wildcards in trustedOrigins strings.
  trustedOrigins: [
    APP_URL,
    'https://preview-*.space-z.ai',
  ],
  database: mongodbAdapter(authDb, { client: authClient }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh once per day
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'employee',
        input: false, // server-only — not settable from the client sign-up form
      },
      employeeId: {
        type: 'string',
        required: false,
        defaultValue: '',
        input: false,
      },
      active: {
        type: 'boolean',
        required: false,
        defaultValue: true,
        input: false,
      },
    },
  },
  advanced: {
    database: {
      // Use Mongo ObjectIds for Better Auth-owned collections for consistency.
      generateId: () => new mongoose.Types.ObjectId().toString(),
    },
  },
});

export default auth;
