// src/app/api/notifications/unread-count/route.js
// Stub — returns 0 until Step 8 implements the real Notification model queries.
// Auth-protected: any signed-in user can read their own count.
import { requireUser } from '@/lib/auth-helpers.js';

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  // TODO Step 8: query Notification.countDocuments({ userId: user.id, read: false })
  return Response.json({ count: 0, userId: user.id });
}
