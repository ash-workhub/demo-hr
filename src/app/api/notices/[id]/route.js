// src/app/api/notices/[id]/route.js
// GET   /api/notices/:id   — single notice (permission-checked)
// PATCH /api/notices/:id   — edit draft (hr/admin only)
// POST  /api/notices/:id/publish  — publish (hr/admin only) — handled via PATCH action
// POST  /api/notices/:id/archive  — archive (hr/admin only) — handled via PATCH action
import { connectDB, CompanyNotice } from '@/lib/db/index.js';
import { requireUser, requireRole } from '@/lib/auth-helpers.js';
import { updateNoticeSchema, validate } from '@/lib/zod-schemas.js';
import { canViewNotice, canManageNotices, canPublish, canArchive } from '@/lib/notice-engine.js';

const COMPANY = 'FegHR Demo';

function toSafe(n) {
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
  };
}

export async function GET(request, { params }) {
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

  // Permission check: can this user view this notice?
  const viewCheck = canViewNotice(notice, { role: user.role, id: user.id });
  if (!viewCheck.allowed) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  return Response.json(toSafe(notice));
}

export async function PATCH(request, { params }) {
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

  const { id } = await params;
  await connectDB();
  const notice = await CompanyNotice.findById(id);
  if (!notice) return Response.json({ error: 'Not found' }, { status: 404 });

  // Handle lifecycle actions: publish, archive
  if (body.action === 'publish') {
    const check = canPublish(notice);
    if (!check.ok) return Response.json({ error: { _: check.error } }, { status: 422 });
    notice.status = 'published';
    notice.publishedAt = new Date();
    notice.publishedBy = user.id;
    notice.publishedByName = user.name || '';
    await notice.save();

    // Create notifications for each audience member.
    await createNoticeNotifications(notice);
    return Response.json(toSafe(notice));
  }

  if (body.action === 'archive') {
    const check = canArchive(notice);
    if (!check.ok) return Response.json({ error: { _: check.error } }, { status: 422 });
    notice.status = 'archived';
    notice.archivedAt = new Date();
    notice.archivedBy = user.id;
    notice.archivedByName = user.name || '';
    await notice.save();
    return Response.json(toSafe(notice));
  }

  // Regular edit (only drafts can be edited)
  if (notice.status !== 'draft') {
    return Response.json({ error: { _: 'Only draft notices can be edited' } }, { status: 422 });
  }

  const { data, error } = validate(updateNoticeSchema, body);
  if (error) return Response.json({ error }, { status: 422 });

  for (const key of Object.keys(data)) notice[key] = data[key];
  await notice.save();
  return Response.json(toSafe(notice));
}

export async function DELETE(request, { params }) {
  // Hard-delete a DRAFT only. Published/archived notices are soft-deleted via archive.
  try {
    await requireRole('hr', 'admin');
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json({ error: status === 403 ? 'Forbidden' : 'Unauthorized' }, { status });
  }

  const { id } = await params;
  await connectDB();
  const notice = await CompanyNotice.findById(id);
  if (!notice) return Response.json({ error: 'Not found' }, { status: 404 });

  if (notice.status !== 'draft') {
    return Response.json({ error: { _: 'Only draft notices can be deleted. Archive published notices instead.' } }, { status: 422 });
  }

  await CompanyNotice.deleteOne({ _id: notice._id });
  return Response.json({ id: notice._id.toString(), deleted: true });
}

// Helper: create notifications on publish (same as in route.js)
async function createNoticeNotifications(notice) {
  try {
    const { User, Notification } = await import('@/lib/db/index.js');
    const audienceUsers = await User.find({
      active: { $ne: false },
      role: { $in: notice.audienceRoles },
    }).lean();

    for (const u of audienceUsers) {
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
