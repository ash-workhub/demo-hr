// scripts/check-db.js
// Atlas connection sanity check. Exits 0 on success, non-zero on failure.
// Run: node scripts/check-db.js
import 'dotenv/config'; // not available; we'll read .env.local manually
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

// Manually load .env.local (Next.js convention)
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('[check-db] FAIL: MONGODB_URI is not set');
  process.exit(2);
}

// Mask credentials when echoing
const masked = uri.replace(/(mongodb(?:\+srv)?:\/\/)([^:]+):([^@]+)@/, '$1$2:***@');
console.log(`[check-db] Connecting to ${masked} ...`);

const start = Date.now();
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const elapsed = Date.now() - start;
  const dbName = mongoose.connection.db?.databaseName || '(default)';

  // Ping
  const admin = mongoose.connection.db.admin();
  const ping = await admin.ping();
  if (!ping?.ok) {
    throw new Error('ping returned ok=0');
  }

  // List collections (empty db is OK; error means permissions issue)
  let collections = [];
  try {
    collections = await mongoose.connection.db.listCollections().toArray();
  } catch (e) {
    console.warn(`[check-db] WARN: listCollections failed: ${e.message}`);
  }

  console.log(`[check-db] OK in ${elapsed}ms — db="${dbName}", collections=${collections.length}`);
  if (collections.length > 0) {
    console.log(`[check-db] Collections: ${collections.map(c => c.name).join(', ')}`);
  }
  await mongoose.disconnect();
  process.exit(0);
} catch (err) {
  const elapsed = Date.now() - start;
  console.error(`[check-db] FAIL after ${elapsed}ms: ${err.name}: ${err.message}`);
  if (err.cause) console.error(`[check-db] cause: ${err.cause.message || err.cause}`);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
}
