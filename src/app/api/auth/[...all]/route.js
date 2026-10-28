// src/app/api/auth/[...all]/route.js
// Better Auth route handler. Mounts all auth endpoints under /api/auth/*.
import { auth } from '@/lib/auth.js';
import { toNextJsHandler } from 'better-auth/next-js';

// toNextJsHandler returns { GET, POST, PATCH, PUT, DELETE } — destructure, then re-export.
const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;
export const POST = handlers.POST;
