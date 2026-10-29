// src/app/api/attendance/holidays/route.js
// GET  /api/attendance/holidays   — list (all signed-in users)
// POST /api/attendance/holidays   — create (hr/admin only)
import { connectDB, Holiday } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { createHolidaySchema, validate } from '@/lib/zod-schemas.js';

const COMPANY = 'FegHR Demo';

function toSafe(h) {
  return {
    id: h._id.toString(),
    date: h.date,
    name: h.name,
    type: h.type,
    status: h.status,
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
  const year = searchParams.get('year');
  const status = searchParams.get('status') || 'active';
  const filter = { company: COMPANY };
  if (status !== 'all') filter.status = status;
  if (year) filter.date = { $regex: `^${year}-` };
  const items = await Holiday.find(filter).sort({ date: 1 }).lean();
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

  const { data, error } = validate(createHolidaySchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  await connectDB();

  try {
    const created = await Holiday.create({ ...data, company: COMPANY });
    return Response.json(toSafe(created), { status: 201 });
  } catch (e) {
    if (e.code === 11000) {
      return Response.json({ error: { date: 'A holiday already exists on this date' } }, { status: 409 });
    }
    return Response.json({ error: { _: 'Failed to create holiday' } }, { status: 500 });
  }
}
