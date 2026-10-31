// src/app/api/notices/route.js
// GET  /api/notices   — list notices (scoped by role + status)
// POST /api/notices   — create notice (hr/admin only)
import { connectDB, CompanyNotice, User } from '@/lib/db/index.js';
import { requireUser, requireRole } from '@/lib/auth-helpers.js';
import { createNoticeSchema, validate } from '@/lib/zod-schemas.js';
import { canManageNotices, computeAudienceCount } from '@/lib/notice-engine.js';

const COMPANY = 'FegHR Demo';

function toSafe(n, userReadState) {
  return {
    id: n._id.toString(),
    title: n.title,
    body: n.body,
    audienceRoles: n.audienceRoles,
    status: n.status,
    author: n.author ? n.author.toString() : null,
    authorName: n.authorName || '',
    publishedAt: n.publishedAt,
    publishedByName: n.publishedByName || '',
    archivedAt: n.archivedAt,
    archivedByName: n.archivedByName || '',
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    read: !!userReadState,
    readAt: userReadState?.readAt || null,
  };
}

export async function GET(request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectDB();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'published';

  const canManage = canManageNotices(user.role);
  const filter = { company: COMPANY };

  if (canManage) {
    // HR/Admin: can see all statuses (draft/published/archived).
    if (status !== 'all') filter.status = status;
  } else {
    // Employee/Manager: only published + in their audience.
    filter.status = 'published';
    filter.audienceRoles = user.role;
  }

  const notices = await CompanyNotice.find(filter).sort({ publishedAt: -1, createdAt: -1 }).lean();

  // For non-managers: attach read state for the current user.
  let readStateMap = new Map();
  if (!canManage) {
    const { NoticeReadState } = await import('@/lib/db/index.js');
    const noticeIds = notices.map((n) => n._id);
    const readStates = await NoticeReadState.find({
      noticeId: { $in: noticeIds },
      userId: user.id,
    }).lean();
    readStateMap = new Map(readStates.map((r) => [r.noticeId.toString(), r]));
  }

  // For managers: attach audience count (for display).
  let audienceCounts = {};
  if (canManage) {
    const allUsers = await User.find({ active: { $ne: false } }).lean();
    for (const n of notices) {
      audienceCounts[n._id.toString()] = computeAudienceCount(n.audienceRoles, allUsers);
    }
  }

  return Response.json({
    items: notices.map((n) => {
      const safe = toSafe(n, readStateMap.get(n._id.toString()));
      if (canManage) safe.audienceCount = audienceCounts[n._id.toString()] || 0;
      return safe;
    }),
  });
}

export async function POST(request) {
  let user;
  try {
    user = await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json({ error: status === 403 ? 'Forbidden — only HR/Admin can manage notices' : 'Unauthorized' }, { status });
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  const { data, error } = validate(createNoticeSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  await connectDB();

  const noticeData = {
    company: COMPANY,
    title: data.title,
    body: data.body,
    audienceRoles: data.audienceRoles,
    status: data.status,
    author: user.id,
    authorName: user.name || '',
  };

  // If status is published, set publication audit fields.
  if (data.status === 'published') {
    noticeData.publishedAt = new Date();
    noticeData.publishedBy = user.id;
    noticeData.publishedByName = user.name || '';
  }

  const notice = await CompanyNotice.create(noticeData);

  // If published, create notifications for each audience member (dedup-safe).
  if (notice.status === 'published') {
    await createNoticeNotifications(notice);
  }

  return Response.json(toSafe(notice), { status: 201 });
}

// Helper: create one notification per audience member on publish.
async function createNoticeNotifications(notice) {
  try {
    const { User, Notification } = await import('@/lib/db/index.js');
    const audienceUsers = await User.find({
      active: { $ne: false },
      role: { $in: notice.audienceRoles },
    }).lean();

    for (const u of audienceUsers) {
      // Dedup: one notification per user per notice (relatedId = notice._id).
      const existing = await Notification.findOne({
        userId: u._id,
        type: 'company_notice',
        relatedId: notice._id,
      }).lean();
      if (existing) continue;

      await Notification.create({
        userId: u._id,
        type: 'company_notice',
        title: `Notice: ${notice.title}`,
        message: notice.body.slice(0, 200),
        link: 'notices',
        relatedId: notice._id,
        read: false,
      });
    }
  } catch (e) {
    console.error('Failed to create notice notifications:', e.message);
  }
}
