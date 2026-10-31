// src/app/api/leave/types/route.js
// GET  /api/leave/types   — list leave types (all signed-in users)
// POST /api/leave/types   — create (hr/admin only)
import { connectDB, LeaveType } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { createLeaveTypeSchema, validate } from '@/lib/zod-schemas.js';

const COMPANY = 'FegHR Demo';

function toSafe(t) {
  return {
    id: t._id.toString(),
    company: t.company,
    code: t.code,
    name: t.name,
    isUnlimited: t.isUnlimited,
    defaultQuota: t.defaultQuota,
    requiresDocumentation: t.requiresDocumentation,
    status: t.status,
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
  if (status !== 'all') filter.status = status;
  const items = await LeaveType.find(filter).sort({ code: 1 }).lean();
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

  const { data, error } = validate(createLeaveTypeSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  await connectDB();

  try {
    const created = await LeaveType.create({ ...data, company: COMPANY });
    return Response.json(toSafe(created), { status: 201 });
  } catch (e) {
    if (e.code === 11000) {
      return Response.json({ error: { code: `Leave type '${data.code}' already exists` } }, { status: 409 });
    }
    return Response.json({ error: { _: 'Failed to create leave type' } }, { status: 500 });
  }
}
