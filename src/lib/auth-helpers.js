// src/lib/auth-helpers.js
// Server-side session + role helpers used by API routes and server components.
import { headers } from 'next/headers';
import { auth } from './auth.js';
import { Employee } from './db/index.js';

/**
 * Returns the current Better Auth session user (with custom `role`/`employeeId` fields),
 * or null if not signed in.
 */
export async function getSessionUser() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return null;
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role || 'employee',
      employeeId: session.user.employeeId || '',
      active: session.user.active !== false,
      image: session.user.image || '',
    };
  } catch (e) {
    return null;
  }
}

/**
 * Throws a 401 Response if no session. Returns the user otherwise.
 */
export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (user.active === false) {
    throw new Response(JSON.stringify({ error: 'Account inactive' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
  return user;
}

/**
 * Throws 401 if no session, 403 if role not allowed. Returns the user otherwise.
 * @param  {...string} roles
 */
export async function requireRole(...roles) {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
  return user;
}

/**
 * Returns the Employee doc linked to the current session user, or null.
 */
export async function getSessionEmployee() {
  const user = await getSessionUser();
  if (!user?.employeeId) return null;
  try {
    return await Employee.findById(user.employeeId).lean();
  } catch {
    return null;
  }
}
