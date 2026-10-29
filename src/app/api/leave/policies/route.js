// src/app/api/leave/policies/route.js
// GET  /api/leave/policies   — list (all signed-in users; they need to see the route rules)
// POST /api/leave/policies   — create (hr/admin only)
import { connectDB, ApprovalPolicy } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { createApprovalPolicySchema, validate } from '@/lib/zod-schemas.js';

const COMPANY = 'FegHR Demo';

function toSafe(p) {
  return {
    id: p._id.toString(),
    company: p.company,
    name: p.name,
    effectiveDate: p.effectiveDate,
    endDate: p.endDate,
    managerStages: p.managerStages,
    finalApproverRole: p.finalApproverRole,
    status: p.status,
    isCurrent: p.endDate === null && p.status === 'active',
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
  const status = searchParams.get('status') || 'all';
  const filter = { company: COMPANY };
  if (status !== 'all') filter.status = status;
  const items = await ApprovalPolicy.find(filter).sort({ effectiveDate: -1 }).lean();
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

  const { data, error } = validate(createApprovalPolicySchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  await connectDB();

  // If effective date is today or past, close any currently-active policy.
  const effDate = new Date(data.effectiveDate);
  effDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (effDate <= today) {
    const current = await ApprovalPolicy.findOne({ company: COMPANY, endDate: null, status: 'active' });
    if (current) {
      const prevEnd = new Date(effDate);
      prevEnd.setDate(prevEnd.getDate() - 1);
      await ApprovalPolicy.updateOne({ _id: current._id }, { $set: { endDate: prevEnd } });
    }
  }

  try {
    const created = await ApprovalPolicy.create({ ...data, company: COMPANY, effectiveDate: effDate });
    return Response.json(toSafe(created), { status: 201 });
  } catch (e) {
    if (e.code === 11000) {
      return Response.json({ error: { _: 'Another active policy already exists. Close it first.' } }, { status: 409 });
    }
    return Response.json({ error: { _: 'Failed to create policy' } }, { status: 500 });
  }
}
