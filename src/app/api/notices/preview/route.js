// src/app/api/notices/preview/route.js
// POST /api/notices/preview  — preview audience count before publication (hr/admin only)
import { connectDB, User } from '@/lib/db/index.js';
import { requireRole } from '@/lib/auth-helpers.js';
import { computeAudienceCount, validateAudienceRoles } from '@/lib/notice-engine.js';

export async function POST(request) {
  let user;
  try {
    user = await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json({ error: status === 403 ? 'Forbidden — only HR/Admin can preview audience' : 'Unauthorized' }, { status });
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  const { audienceRoles } = body;
  const validation = validateAudienceRoles(audienceRoles);
  if (!validation.ok) {
    return Response.json({ error: { audienceRoles: validation.error } }, { status: 422 });
  }

  await connectDB();
  const allUsers = await User.find({ active: { $ne: false } }).lean();
  const count = computeAudienceCount(audienceRoles, allUsers);

  // Breakdown by role for display.
  const breakdown = {};
  for (const role of audienceRoles) {
    breakdown[role] = allUsers.filter((u) => u.role === role).length;
  }

  return Response.json({ count, breakdown, audienceRoles });
}
