// src/app/api/notifications/unread-count/route.js
// Returns the count of unread notifications for the current user.
import { requireUser } from '@/lib/auth-helpers.js';
import { connectDB, Notification } from '@/lib/db/index.js';

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectDB();
  const count = await Notification.countDocuments({ userId: user.id, read: false });
  return Response.json({ count, userId: user.id });
}
