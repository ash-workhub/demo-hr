// src/app/api/notifications/route.js
// GET  /api/notifications        — list current user's notifications (filterable)
// POST /api/notifications        — mark all as read (body: { action: 'mark-all-read' })
import { requireUser } from '@/lib/auth-helpers.js';
import { connectDB, Notification } from '@/lib/db/index.js';

function toSafe(n) {
  return {
    id: n._id.toString(),
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link || '',
    relatedId: n.relatedId ? n.relatedId.toString() : null,
    read: !!n.read,
    createdAt: n.createdAt,
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
  const filter = searchParams.get('filter') || 'all'; // 'all' | 'unread'
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

  const q = { userId: user.id };
  if (filter === 'unread') q.read = false;

  const items = await Notification.find(q)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const unreadCount = await Notification.countDocuments({ userId: user.id, read: false });

  return Response.json({
    items: items.map(toSafe),
    unreadCount,
    filter,
  });
}

export async function POST(request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { _: 'Invalid JSON body' } }, { status: 400 });
  }

  if (body.action !== 'mark-all-read') {
    return Response.json({ error: { _: 'Unknown action' } }, { status: 422 });
  }

  await connectDB();
  const result = await Notification.updateMany(
    { userId: user.id, read: false },
    { $set: { read: true } }
  );
  return Response.json({ updated: result.modifiedCount || 0 });
}
