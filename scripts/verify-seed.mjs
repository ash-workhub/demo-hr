// scripts/verify-seed.mjs
// Verifies the seeded Better Auth users actually carry the custom role/employeeId fields.
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
const db = mongoose.connection.db;

const users = await db.collection('user').find({}).toArray();
console.log(`[verify] Found ${users.length} user docs`);
for (const u of users) {
  console.log(`  ${u.email.padEnd(28)} role=${u.role || '(none)'} employeeId=${u.employeeId || '(none)'} active=${u.active}`);
}

const accounts = await db.collection('account').countDocuments();
console.log(`[verify] Found ${accounts} account (credentials) docs`);

await mongoose.disconnect();
process.exit(0);
