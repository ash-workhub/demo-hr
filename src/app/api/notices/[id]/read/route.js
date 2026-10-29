// src/app/api/notices/[id]/read/route.js
// POST /api/notices/:id/read  — mark a notice as read for the current user
//
// Employees can only mark their OWN read state. The userId comes from the session,
// never from the client. This is the read-state privacy guarantee.
import { connectDB, CompanyNotice, NoticeReadState } from '@/lib/db/index.js';
import { requireUser } from '@/lib/auth-helpers.js';
import { canViewNotice } from '@/lib/notice-engine.js';

export async function POST(request, { params }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  await connectDB();

  const notice = await CompanyNotice.findById(id).lean();
  if (!notice) return Response.json({ error: 'Not found' }, { status: 404 });

  // Permission: can this user view this notice? (Only published + in audience for employees)
  const viewCheck = canViewNotice(notice, { role: user.role, id: user.id });
  if (!viewCheck.allowed) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Upsert the read state — userId comes from the session, NOT the client.
  // This guarantees employees can only mark their OWN read state.
  const existing = await NoticeReadState.findOne({ noticeId: notice._id, userId: user.id }).lean();
  if (existing) {
    return Response.json({ id: existing._id.toString(), noticeId: notice._id.toString(), userId: user.id, readAt: existing.readAt, alreadyRead: true });
  }

  const readState = await NoticeReadState.create({
    noticeId: notice._id,
    userId: user.id,
    readAt: new Date(),
  });

  return Response.json({
    id: readState._id.toString(),
    noticeId: readState.noticeId.toString(),
    userId: user.id,
    readAt: readState.readAt,
    alreadyRead: false,
  }, { status: 201 });
}
