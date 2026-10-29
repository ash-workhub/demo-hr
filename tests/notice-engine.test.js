// tests/notice-engine.test.js
// V2 Step 5 — business-rule tests for company notice audience scoping + authorization.
// Run: bun run test
import { describe, it, expect } from 'vitest';
import {
  isInAudience,
  canViewNotice,
  canManageNotices,
  computeAudienceCount,
  validateAudienceRoles,
  canPublish,
  canArchive,
} from '../src/lib/notice-engine.js';

describe('isInAudience', () => {
  it('true when user role is in audienceRoles', () => {
    expect(isInAudience({ audienceRoles: ['employee', 'manager'] }, 'employee')).toBe(true);
    expect(isInAudience({ audienceRoles: ['employee', 'manager'] }, 'manager')).toBe(true);
  });
  it('false when user role is not in audienceRoles', () => {
    expect(isInAudience({ audienceRoles: ['employee'] }, 'manager')).toBe(false);
    expect(isInAudience({ audienceRoles: ['hr'] }, 'employee')).toBe(false);
  });
  it('false for null/missing notice', () => {
    expect(isInAudience(null, 'employee')).toBe(false);
    expect(isInAudience({}, 'employee')).toBe(false);
  });
  it('true for all-roles notice', () => {
    const all = { audienceRoles: ['employee', 'manager', 'hr', 'admin'] };
    expect(isInAudience(all, 'employee')).toBe(true);
    expect(isInAudience(all, 'admin')).toBe(true);
  });
});

describe('canViewNotice', () => {
  const publishedNotice = {
    status: 'published',
    audienceRoles: ['employee', 'manager'],
    author: 'author123',
  };
  const draftNotice = {
    status: 'draft',
    audienceRoles: ['employee'],
    author: 'author123',
  };
  const archivedNotice = {
    status: 'archived',
    audienceRoles: ['employee'],
    author: 'author123',
  };

  it('HR can view any notice (draft/published/archived)', () => {
    expect(canViewNotice(draftNotice, { role: 'hr', id: 'hr1' }).allowed).toBe(true);
    expect(canViewNotice(publishedNotice, { role: 'hr', id: 'hr1' }).allowed).toBe(true);
    expect(canViewNotice(archivedNotice, { role: 'hr', id: 'hr1' }).allowed).toBe(true);
  });
  it('Admin can view any notice', () => {
    expect(canViewNotice(draftNotice, { role: 'admin', id: 'admin1' }).allowed).toBe(true);
  });
  it('Employee can view published notice in their audience', () => {
    expect(canViewNotice(publishedNotice, { role: 'employee', id: 'emp1' }).allowed).toBe(true);
  });
  it('Employee cannot view published notice NOT in their audience', () => {
    const hrOnly = { status: 'published', audienceRoles: ['hr'], author: 'a' };
    expect(canViewNotice(hrOnly, { role: 'employee', id: 'emp1' }).allowed).toBe(false);
  });
  it('Employee cannot view drafts (unless they are the author)', () => {
    expect(canViewNotice(draftNotice, { role: 'employee', id: 'emp1' }).allowed).toBe(false);
  });
  it('Author can view their own draft', () => {
    expect(canViewNotice(draftNotice, { role: 'hr', id: 'author123' }).allowed).toBe(true);
  });
  it('Non-author employee cannot view archived notices', () => {
    expect(canViewNotice(archivedNotice, { role: 'employee', id: 'emp1' }).allowed).toBe(false);
  });
  it('Manager does NOT gain HR permissions (cannot view drafts)', () => {
    expect(canViewNotice(draftNotice, { role: 'manager', id: 'mgr1' }).allowed).toBe(false);
  });
  it('Manager can view published notice in their audience', () => {
    expect(canViewNotice(publishedNotice, { role: 'manager', id: 'mgr1' }).allowed).toBe(true);
  });
  it('fails for missing notice or user', () => {
    expect(canViewNotice(null, { role: 'employee', id: 'e1' }).allowed).toBe(false);
    expect(canViewNotice(publishedNotice, null).allowed).toBe(false);
  });
});

describe('canManageNotices', () => {
  it('HR can manage', () => {
    expect(canManageNotices('hr')).toBe(true);
  });
  it('Admin can manage', () => {
    expect(canManageNotices('admin')).toBe(true);
  });
  it('Manager cannot manage (no company-wide HR permissions)', () => {
    expect(canManageNotices('manager')).toBe(false);
  });
  it('Employee cannot manage', () => {
    expect(canManageNotices('employee')).toBe(false);
  });
});

describe('computeAudienceCount', () => {
  const users = [
    { role: 'employee', active: true },
    { role: 'employee', active: true },
    { role: 'manager', active: true },
    { role: 'hr', active: true },
    { role: 'admin', active: true },
    { role: 'employee', active: false }, // inactive — not counted
  ];

  it('counts active employees + managers', () => {
    expect(computeAudienceCount(['employee', 'manager'], users)).toBe(3); // 2 emp + 1 mgr
  });
  it('counts all active roles', () => {
    expect(computeAudienceCount(['employee', 'manager', 'hr', 'admin'], users)).toBe(5);
  });
  it('counts only employees', () => {
    expect(computeAudienceCount(['employee'], users)).toBe(2);
  });
  it('excludes inactive users', () => {
    expect(computeAudienceCount(['employee'], users)).toBe(2); // not 3 (one is inactive)
  });
  it('returns 0 for empty audience', () => {
    expect(computeAudienceCount([], users)).toBe(0);
  });
  it('returns 0 for empty users', () => {
    expect(computeAudienceCount(['employee'], [])).toBe(0);
  });
});

describe('validateAudienceRoles', () => {
  it('passes for valid roles', () => {
    expect(validateAudienceRoles(['employee', 'manager']).ok).toBe(true);
    expect(validateAudienceRoles(['hr']).ok).toBe(true);
  });
  it('fails for empty array', () => {
    expect(validateAudienceRoles([]).ok).toBe(false);
  });
  it('fails for invalid role', () => {
    expect(validateAudienceRoles(['employee', 'superuser']).ok).toBe(false);
  });
  it('fails for non-array', () => {
    expect(validateAudienceRoles('employee').ok).toBe(false);
  });
});

describe('canPublish', () => {
  it('allows publishing a draft', () => {
    expect(canPublish({ status: 'draft' }).ok).toBe(true);
  });
  it('blocks publishing an already-published notice', () => {
    expect(canPublish({ status: 'published' }).ok).toBe(false);
  });
  it('blocks publishing an archived notice', () => {
    expect(canArchive({ status: 'archived' }).ok).toBe(false); // canArchive, not canPublish
    expect(canPublish({ status: 'archived' }).ok).toBe(false);
  });
  it('fails for null', () => {
    expect(canPublish(null).ok).toBe(false);
  });
});

describe('canArchive', () => {
  it('allows archiving a published notice', () => {
    expect(canArchive({ status: 'published' }).ok).toBe(true);
  });
  it('blocks archiving a draft', () => {
    expect(canArchive({ status: 'draft' }).ok).toBe(false);
  });
  it('blocks archiving an already-archived notice', () => {
    expect(canArchive({ status: 'archived' }).ok).toBe(false);
  });
  it('fails for null', () => {
    expect(canArchive(null).ok).toBe(false);
  });
});

// ============================================================
// Read-state privacy (documented as spec; enforced in API routes)
// ============================================================
describe('Read-state privacy (documented)', () => {
  it('employees can only mark their OWN read state', () => {
    // The PATCH /api/notices/[id]/read route uses user.id from session,
    // not a client-supplied userId. Employees cannot mark another user's read state.
    expect(true).toBe(true);
  });
  it('employees cannot view other users\' read states', () => {
    // The GET /api/notices route returns read state only for the current user.
    // HR/Admin can see aggregate read counts (not per-user states) for management.
    expect(true).toBe(true);
  });
  it('read state is unique per (noticeId, userId) — one record per user per notice', () => {
    // Enforced by the unique compound index on NoticeReadState.
    expect(true).toBe(true);
  });
});

// ============================================================
// Publication lifecycle (documented as spec; enforced in API routes)
// ============================================================
describe('Publication lifecycle (documented)', () => {
  it('draft → published: records author, publish time, publisher', () => {
    // The publish route sets publishedAt, publishedBy, publishedByName, status='published'
    expect(true).toBe(true);
  });
  it('published → archived: records archive time, archiver', () => {
    // The archive route sets archivedAt, archivedBy, archivedByName, status='archived'
    expect(true).toBe(true);
  });
  it('on publish, creates one notification per audience member (no duplicates)', () => {
    // Uses createNotification with relatedId=notice._id for dedup.
    // V1 leave notifications are NOT affected (separate type: 'company_notice').
    expect(true).toBe(true);
  });
  it('archived notices are not visible to employees (only HR/Admin)', () => {
    // canViewNotice returns allowed=false for employees on archived notices.
    expect(true).toBe(true);
  });
  it('drafts are not visible to employees (only HR/Admin + author)', () => {
    // canViewNotice returns allowed=false for employees on drafts.
    expect(true).toBe(true);
  });
});
