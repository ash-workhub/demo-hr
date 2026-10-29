// src/app/api/notifications/[id]/route.js
// PATCH /api/notifications/:id  — mark a single notification as read
import { requireUser } from '@/lib/auth-helpers.js';
import { connectDB, Notification } from '@/lib/db/index.js';

export async function PATCH(request, { params }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  await connectDB();

  const n = await Notification.findById(id);
  if (!n) return Response.json({ error: 'Not found' }, { status: 404 });

  // Ownership check — a user can only mark their own notifications as read.
  if (n.userId.toString() !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!n.read) {
    n.read = true;
    await n.save();
  }
  return Response.json({ id: n._id.toString(), read: true });
}
