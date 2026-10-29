// src/app/api/branches/route.js
// GET  /api/branches   — list branches (all signed-in users)
// POST /api/branches   — create branch (hr/admin only)
import { connectDB, Branch } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { createBranchSchema, validate } from '@/lib/zod-schemas.js';
import { checkDuplicateReference } from '@/lib/org-engine.js';

const COMPANY = 'FegHR Demo';

function toSafe(b) {
  return {
    id: b._id.toString(),
    company: b.company,
    code: b.code,
    name: b.name,
    address: b.address || '',
    status: b.status,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

export async function GET(request) {
  try {
    await requireRole('employee', 'manager', 'hr', 'admin');
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await connectDB();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'active';
  const filter = { company: COMPANY };
  if (status && status !== 'all') filter.status = status;
  const items = await Branch.find(filter).sort({ code: 1 }).lean();
  return Response.json({ items: items.map(toSafe) });
}

export async function POST(request) {
  let user;
  try {
    user = await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json({ error: status === 403 ? 'Forbidden' : 'Unauthorized' }, { status });
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  const { data, error } = validate(createBranchSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  await connectDB();

  // Pre-check for duplicate code/name within the company.
  const existing = await Branch.find({ company: COMPANY }).lean();
  const dup = checkDuplicateReference(existing, data.code, data.name);
  if (dup.hasDuplicate) {
    return Response.json({ error: { [dup.field]: dup.reason } }, { status: 409 });
  }

  try {
    const created = await Branch.create({ ...data, company: COMPANY });
    return Response.json(toSafe(created), { status: 201 });
  } catch (e) {
    if (e.code === 11000) {
      const field = Object.keys(e.keyPattern || {})[1] || 'field';
      return Response.json({ error: { [field]: `${field} already exists` } }, { status: 409 });
    }
    return Response.json({ error: { _: 'Failed to create branch' } }, { status: 500 });
  }
}
