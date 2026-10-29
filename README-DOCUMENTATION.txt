================================================================================
                    FegHR V1 — HR Prototype Documentation
================================================================================

A fictional-data HR prototype for "FegHR Demo" company (timezone: Asia/Dhaka).
Built with Next.js 16, MongoDB Atlas, Better Auth, HeroUI, Recharts, Zod, Vitest.

This document covers everything you need to understand, run, and test the app:
  1. Project overview
  2. Tech stack
  3. Setup & installation
  4. Demo accounts (all roles)
  5. Roles & permissions matrix
  6. User actions by role (detailed)
  7. Feature walkthroughs
  8. API reference
  9. Business rules (leave engine)
  10. Testing
  11. Security notes
  12. Known limitations & future work
  13. File structure


================================================================================
1. PROJECT OVERVIEW
================================================================================

FegHR V1 is a minimal HR management prototype with 6 core modules:

  - Employee Directory   : Searchable list + profiles + role-aware editing
  - Daily Attendance     : Check-in/out, self history, team view for managers
  - Leave Requests       : Apply for leave, track status, view balance
  - Approvals            : Manager → HR two-stage approval chain
  - Notifications        : In-app alerts for leave events, deep-linking
  - Dashboard            : Role-aware KPIs and Recharts visualizations

Scope boundaries (by design):
  - NO payroll, NO salary, NO payment processing
  - NO external messaging (email/SMS)
  - NO real employee data — all accounts are fictional (@feghr.demo)
  - Single company, single tenant


================================================================================
2. TECH STACK
================================================================================

Frontend:
  - Next.js 16 (App Router) — JavaScript (not TypeScript)
  - React 19
  - Tailwind CSS v4
  - HeroUI v3 (only UI component library; no DaisyUI, no shadcn in new code)
  - Recharts (dashboard charts only)

Backend:
  - Node.js runtime (via Next.js API routes)
  - MongoDB Atlas (cloud) + Mongoose ODM
  - Better Auth 1.7.x with MongoDB adapter (email + password auth)
  - Zod (server-side input validation on every API route)

Testing & tooling:
  - Vitest (business-rule tests for the leave engine)
  - ESLint (Next.js config)

Auth & sessions:
  - Better Auth issues a signed session cookie (better-auth.session_token)
  - Sessions expire after 7 days, refresh once per day
  - Custom user fields: role, employeeId, active (server-set, not client-editable)


================================================================================
3. SETUP & INSTALLATION
================================================================================

Prerequisites:
  - Node.js 20+ (tested on Node 24)
  - bun (runtime + package manager) — or npm/yarn works too
  - A MongoDB Atlas cluster (free M0 tier is sufficient)

Steps:

  1. Clone the repo:
       git clone https://github.com/ash-workhub/demo-hr.git
       cd demo-hr

  2. Install dependencies:
       bun install
     (or: npm install)

  3. Create .env.local in the project root with these variables:
       MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>/fegHR?retryWrites=true&w=majority
       BETTER_AUTH_SECRET=<random 32+ char string>
       NEXT_PUBLIC_APP_URL=http://localhost:3000
       TZ=Asia/Dhaka

     IMPORTANT:
       - .env.local is gitignored — never commit it.
       - For MongoDB Atlas: add your IP (or 0.0.0.0/0 for testing) to the
         cluster's Network Access list.

  4. Seed the database (creates 10 demo employees + Better Auth accounts):
       node scripts/seed.mjs

  5. Start the dev server:
       bun run dev
     (or: npm run dev)

  6. Open http://localhost:3000 in your browser. You should see the login page.

  7. Sign in with any demo account (see section 4 below).
     Password for ALL accounts: FegHR-Demo-2026!

Useful scripts:
  - bun run dev          : Start dev server (port 3000)
  - bun run lint         : Run ESLint
  - bun run test         : Run Vitest (59 business-rule tests)
  - node scripts/seed.mjs        : Re-seed the database (idempotent)
  - node scripts/check-db.js     : Test Atlas connection
  - node scripts/verify-seed.mjs : Verify seeded users have role + employeeId
  - node scripts/git-push.mjs main : Push to GitHub (reads GITHUB_TOKEN from env)


================================================================================
4. DEMO ACCOUNTS (ALL ROLES)
================================================================================

Password for every account: FegHR-Demo-2026!

  Role        Email                  Name              Employee ID
  ----------  ---------------------  ----------------  -----------
  admin       admin@feghr.demo       Aria Hossain      FEG-001
  hr          hr@feghr.demo          Nadia Rahman      FEG-002
  manager     mgr.eng@feghr.demo     Tanvir Ahmed      FEG-003  (Engineering)
  manager     mgr.sales@feghr.demo   Sadia Islam       FEG-004  (Sales)
  employee    emp1@feghr.demo        Rafi Karim        FEG-005  (Eng, reports to Tanvir)
  employee    emp2@feghr.demo        Mehzabin Chowdhury FEG-006 (Eng, reports to Tanvir)
  employee    emp3@feghr.demo        Imran Khan        FEG-007  (Eng, reports to Tanvir)
  employee    emp4@feghr.demo        Farhana Yasmin    FEG-008  (Sales, reports to Sadia)
  employee    emp5@feghr.demo        Shakib Miah       FEG-009  (Sales, reports to Sadia)
  employee    emp6@feghr.demo        Lamia Akter       FEG-010  (Sales, reports to Sadia)

Org chart:
  - Aria (admin)         — no manager
  - Nadia (hr)           — no manager
  - Tanvir (manager)     — no manager; manages Rafi, Mehzabin, Imran
  - Sadia (manager)      — no manager; manages Farhana, Shakib, Lamia


================================================================================
5. ROLES & PERMISSIONS MATRIX
================================================================================

The app has 4 roles. Permissions are enforced on the SERVER (API routes),
not just in the UI.

  Action                          | employee | manager | hr  | admin |
  ------------------------------- | -------- | ------- | --- | ----- |
  Sign in / sign out              |    Y     |   Y     | Y   |  Y    |
  View own dashboard              |    Y     |   Y     | Y   |  Y    |
  View employee directory (list)  |    Y     |   Y     | Y   |  Y    |
  View employee profile (any)     |    Y     |   Y     | Y   |  Y    |
  Create employee                 |    -     |   -     | Y   |  Y    |
  Edit employee                   |    -     |   -     | Y   |  Y    |
  Deactivate employee             |    -     |   -     | -   |  Y    |
  Check in / check out (self)     |    Y     |   Y     | Y   |  Y    |
  View own attendance history     |    Y     |   Y     | Y   |  Y    |
  View team attendance (today)    |    -     |   Y*    | Y   |  Y    |
  Apply for leave (self)          |    Y     |   Y     | Y   |  Y    |
  Cancel own leave (if active)    |    Y     |   Y     | Y   |  Y    |
  View own leave requests         |    Y     |   Y     | Y   |  Y    |
  View own leave balance          |    Y     |   Y     | Y   |  Y    |
  Approve/reject at stage 1       |    -     |   Y**   | -   |  Y    |
  Approve/reject at stage 2       |    -     |   -     | Y   |  Y    |
  View pending approvals queue    |    -     |   Y*    | Y   |  Y    |
  View own notifications          |    Y     |   Y     | Y   |  Y    |
  Mark own notifications as read  |    Y     |   Y     | Y   |  Y    |

  *  Manager sees only their direct reports; HR/admin see all employees.
  ** Only the employee's DIRECT manager can act at stage 1 — not any manager.
     Self-approval is blocked even if the owner is HR or admin.

Nav items visible by role:
  - employee   : Dashboard, Directory, Attendance, Leave, Notifications (5)
  - manager    : + Approvals (6)
  - hr         : + Approvals (6)
  - admin      : + Approvals (6)


================================================================================
6. USER ACTIONS BY ROLE (DETAILED)
================================================================================

------------------------------------------------------------------------------
6.1 EMPLOYEE
------------------------------------------------------------------------------

Sign in / Sign out:
  - Sign in with email + password on the login page
  - Use the "Quick fill" buttons to auto-populate demo credentials
  - Sign out via the button in the top-right corner

Dashboard:
  - View personal KPIs: attendance rate (last 7 days), leave remaining,
    pending requests, today's date
  - View 7-day attendance trend bar chart (color-coded: green=present,
    amber=late, red=absent)
  - View leave balance bar chart (total vs remaining for casual/sick/earned)
  - View recent leave requests (last 5) with status badges
  - Click "View all →" to jump to the Leave Requests view

Employee Directory:
  - Search by name, email, employee ID, or designation (debounced)
  - Filter by department (auto-populated dropdown)
  - Filter by status (active / inactive / all)
  - Paginate through results (20 per page)
  - Click any employee to open their profile in a side panel
  - Profile shows: ID, email, phone, department, designation, manager,
    direct reports count, join date, status
  - CANNOT edit or deactivate (no Edit/Deactivate buttons shown)

Daily Attendance:
  - View today's date + live clock (Asia/Dhaka)
  - View today's check-in time, check-out time, and status
  - Click "Check in" to record check-in (server timestamp)
  - Click "Check out" to record check-out (only after check-in)
  - View last 7 days history with status per day
  - Cannot access the "All employees" / team tab

Leave Requests:
  - Apply for leave: select type (casual/sick/earned/unpaid), pick start/end
    dates, optionally check "Half-day leave" (only for single-day ranges),
    enter reason (min 5 chars)
  - View leave balance card (casual/sick/earned with progress bars, unpaid
    with used count)
  - View "My requests" tab — list of all own leave requests with status
  - Cancel a pending leave (button shows only for active leaves)

Notifications:
  - View all notifications (leave submitted, approved, rejected, etc.)
  - Filter: All / Unread (with count)
  - Click a notification to mark it as read + deep-link to the related view
    (e.g., "Leave approved by manager" → jumps to Leave Requests)
  - "Mark all as read" button
  - Bell icon in topbar shows unread count badge

------------------------------------------------------------------------------
6.2 MANAGER (everything an employee can do, PLUS:)
------------------------------------------------------------------------------

Daily Attendance — Team tab:
  - Switch to "My team" tab
  - View summary cards: Present, Late, Absent, On leave (counts out of team size)
  - View team list with each member's check-in/out times and status
  - Refresh button to re-fetch

Approvals:
  - See "Approvals" in the navigation sidebar
  - View pending leave requests from direct reports (stage: pending_manager)
  - For each request: see employee name, leave type, days, date range, reason
  - Click "Approve" → optional note field → "Confirm approve"
  - Click "Reject" → optional note field → "Confirm reject"
  - Approved leaves move to pending_hr (HR sees them next)
  - Rejected leaves go to final "rejected" state
  - CANNOT approve at the HR stage (only HR/admin can)
  - CANNOT approve own leave (self-approval blocked)

Dashboard (manager variant):
  - KPIs: team size, present today, absent today, pending approvals
  - Team attendance donut chart (present/late/absent/leave breakdown)
  - Team leave usage bar chart (by type, this year)
  - Recent team leave requests list
  - "X pending → Review" link jumps to Approvals

------------------------------------------------------------------------------
6.3 HR (everything a manager can do, PLUS:)
------------------------------------------------------------------------------

Employee Directory — Edit:
  - "Edit" button visible on employee profiles
  - Edit form: first/last name, email, phone, department, designation,
    manager (dropdown of manager/hr/admin employees), role, status,
    join date, avatar color
  - Validation: required fields, email format, manager must be manager/hr/admin,
    self-manager loop prevented
  - Save changes → persisted to DB

Employee Directory — Create (via API; UI button not yet added):
  - POST /api/employees with employee details
  - Employee ID auto-generated (FEG-011, FEG-012, ...)
  - Manager role validated server-side

Approvals — HR stage:
  - View pending leave requests at stage pending_hr (from all employees)
  - Approve → final "approved" state → balance decremented
  - Reject → final "rejected" state
  - CANNOT approve own leave (self-approval blocked)

Daily Attendance — All employees:
  - "All employees" tab shows every active employee's attendance for today

Dashboard (HR/admin variant):
  - KPIs: total employees, present today, absent today, pending approvals
  - Company attendance donut chart
  - Leave distribution pie chart (pending_manager/pending_hr/approved/rejected/cancelled)
  - Approved leave by type bar chart
  - Attendance rate by department bar chart
  - Headcount by department horizontal bar chart
  - "X leave requests awaiting your action → Go to approvals" CTA

------------------------------------------------------------------------------
6.4 ADMIN (everything HR can do, PLUS:)
------------------------------------------------------------------------------

Employee Directory — Deactivate:
  - "Deactivate" button visible on employee profiles (except own)
  - Soft-delete: sets status to "inactive" (employee can't sign in)
  - Can be undone by setting status back to "active" via edit

Approvals — both stages:
  - Admin sees pending leaves at BOTH stages (pending_manager + pending_hr)
  - Can act at either stage (bypasses the direct-manager requirement)


================================================================================
7. FEATURE WALKTHROUGHS
================================================================================

------------------------------------------------------------------------------
7.1 LEAVE APPROVAL CHAIN (end-to-end example)
------------------------------------------------------------------------------

  1. Employee (Rafi) applies for 3 days casual leave (Nov 2-4)
     → Leave created with status: pending_manager
     → Manager (Tanvir) gets a notification: "New leave request"

  2. Manager (Tanvir) opens Approvals
     → Sees Rafi's request
     → Clicks "Approve" with note "OK by me"
     → Leave status: pending_manager → pending_hr
     → Rafi gets notification: "Leave approved by manager"

  3. HR (Nadia) opens Approvals
     → Sees Rafi's request (now at pending_hr stage)
     → Clicks "Approve" with note "Approved by HR"
     → Leave status: pending_hr → approved (final)
     → Rafi's casual balance: used 0 → 3 (auto-decremented)
     → Rafi gets notification: "Leave approved"

  Alternative paths:
  - Manager rejects → status: rejected (final). Rafi notified.
  - HR rejects → status: rejected (final). Rafi notified.
  - Rafi cancels before final decision → status: cancelled (final).

  Audit trail:
  Every transition appends to history[]:
    { action, by, byRole, note, fromStatus, toStatus, at }
  History is append-only — never updated or deleted.

------------------------------------------------------------------------------
7.2 ATTENDANCE CHECK-IN/OUT
------------------------------------------------------------------------------

  1. Employee opens Daily Attendance view
  2. Sees today's date + live clock (Asia/Dhaka)
  3. Clicks "Check in"
     → Server records checkInTime = new Date() (UTC)
     → Status = "present" (if before 09:30 Asia/Dhaka) or "late" (if after)
     → One record per employee per day (unique compound index)
  4. Later, clicks "Check out"
     → Server records checkOutTime = new Date()
  5. Duplicate check-in → 409 "Already checked in today"
  6. Check-out without check-in → 409 "Cannot check out without checking in first"

------------------------------------------------------------------------------
7.3 HALF-DAY LEAVE
------------------------------------------------------------------------------

  1. Employee selects a single day as both start and end date
  2. "Half-day leave" checkbox becomes enabled
  3. Check the box → days calculated as 0.5
  4. Submit → balance decremented by 0.5 on approval
  5. If user tries to check the box for a multi-day range → checkbox is disabled


================================================================================
8. API REFERENCE
================================================================================

All endpoints require authentication (Better Auth session cookie) unless noted.
All write endpoints validate input with Zod.

------------------------------------------------------------------------------
AUTH (Better Auth)
------------------------------------------------------------------------------
  POST   /api/auth/sign-in/email        Sign in (email + password)
  POST   /api/auth/sign-out             Sign out (requires JSON Content-Type + Origin header)
  GET    /api/auth/get-session          Get current session + user
  GET    /api/auth/ok                   Health check

------------------------------------------------------------------------------
EMPLOYEES
------------------------------------------------------------------------------
  GET    /api/employees                 List (search, filter, paginate)
       Query: q, department, status, page, limit
       Roles: all
  POST   /api/employees                 Create
       Roles: hr, admin
       Body: firstName, lastName, email, phone?, department, designation,
             managerId?, role, joinDate, avatarColor?
  GET    /api/employees/:id             Get profile
       Roles: all
  PATCH  /api/employees/:id             Update
       Roles: hr, admin
       Body: any subset of create fields
  DELETE /api/employees/:id             Soft-delete (status → inactive)
       Roles: admin only

------------------------------------------------------------------------------
ATTENDANCE
------------------------------------------------------------------------------
  GET    /api/attendance                Self history (7 days) or team view
       Query: scope=self|team, date, days
       Self: all roles
       Team: manager (direct reports), hr/admin (all). Employee → 403
  POST   /api/attendance                Check-in or check-out
       Body: action=check-in|check-out, notes?
       Roles: all (self only)

------------------------------------------------------------------------------
LEAVE
------------------------------------------------------------------------------
  GET    /api/leave                     My requests + balance (default)
       Query: scope=self|pending
       Pending: manager/hr/admin only
  POST   /api/leave                     Apply for leave
       Body: leaveType, startDate, endDate, reason, isHalfDay?
       Roles: all (self only)
       Checks: overlap, balance (with pending reservation)
  GET    /api/leave/:id                 Get leave detail
       Roles: owner, direct manager, hr, admin
  PATCH  /api/leave/:id                 Cancel own leave (if active)
       Body: action=cancel
       Roles: owner only
  POST   /api/leave/:id/action          Approve or reject
       Body: decision=approved|rejected, note?
       Stage 1 (pending_manager): direct manager or admin
       Stage 2 (pending_hr): hr or admin
       Self-approval blocked (403)

------------------------------------------------------------------------------
NOTIFICATIONS
------------------------------------------------------------------------------
  GET    /api/notifications             List own notifications
       Query: filter=all|unread, limit
  POST   /api/notifications             Mark all as read
       Body: action=mark-all-read
  PATCH  /api/notifications/:id         Mark one as read
       Ownership-checked (403 if not yours)
  GET    /api/notifications/unread-count Get unread count

------------------------------------------------------------------------------
DASHBOARD
------------------------------------------------------------------------------
  GET    /api/dashboard                 Role-aware KPIs + chart data
       Returns different shape per role (employee/manager/hr-admin)


================================================================================
9. BUSINESS RULES (LEAVE ENGINE)
================================================================================

The leave logic lives in src/lib/leave-engine.js — pure functions, fully
unit-tested (59 tests in tests/leave-engine.test.js).

State machine:
  pending_manager ──manager approve──→ pending_hr ──hr approve──→ approved
  pending_manager ──manager reject──→ rejected
  pending_hr      ──hr reject──→      rejected
  any active      ──owner cancel──→   cancelled

Day calculation:
  - Weekdays only (Monday-Friday). Weekends excluded.
  - Inclusive date range (start and end both count).
  - Half-day: 0.5 days, only valid for a single weekday (start === end).

Overlap detection:
  - A new leave cannot overlap with any existing active or approved leave.
  - Rejected and cancelled leaves do NOT block.
  - Overlap check: ns <= le AND ls <= ne (date ranges).

Balance reservation:
  - available = total - used - reserved
  - used = days from approved leaves
  - reserved = days from pending leaves (pending_manager + pending_hr) of the SAME type
  - Unpaid leave has no cap (always allowed).

Approval permissions:
  - Stage 1 (pending_manager): only the employee's DIRECT manager or admin
  - Stage 2 (pending_hr): only HR or admin
  - Self-approval: BLOCKED (owner cannot act on their own leave, even if HR/admin)

Balance update:
  - On final HR approval, the leave's days are added to the balance's `used` field
    for the corresponding type.
  - On rejection/cancellation, balance is NOT affected (only approved leaves consume).

Notification deduplication:
  - One notification per (userId, type, relatedId) combination.
  - Enforced by a pre-check + a unique partial DB index.


================================================================================
10. TESTING
================================================================================

Run tests:
  bun run test
  (or: npx vitest run)

Test coverage (59 tests):
  - State machine transitions (approve, reject, cancel)
  - Day calculation (weekdays, half-days, multi-day ranges)
  - Balance checking (with and without reservation)
  - Overlap detection (approved, pending, rejected, cancelled leaves)
  - Permission checks (who can act at each stage)
  - Notification dedup logic

Lint:
  bun run lint
  (ESLint with Next.js config — currently 0 errors, 0 warnings)


================================================================================
11. SECURITY NOTES
================================================================================

Authentication:
  - Better Auth with email + password (bcrypt-hashed).
  - Session cookie signed with BETTER_AUTH_SECRET.
  - Sessions expire after 7 days.

Authorization (server-enforced):
  - Every API route calls requireUser() or requireRole(...roles).
  - Role checks happen BEFORE any DB access.
  - The user.role field has input:false in Better Auth config — clients
    cannot change their own role via the API.

Data isolation:
  - Employees see only their own attendance, leave, notifications.
  - Managers see their direct reports' data (team view).
  - HR/admin see all data.
  - Notifications are ownership-checked (403 on cross-user access).

Input validation:
  - Zod schemas on every write endpoint.
  - Unknown fields rejected (strict parsing).
  - Field-level error messages returned (422).

Secrets:
  - .env.local is gitignored — never committed.
  - No secrets in tracked files (verified via git ls-files).
  - GitHub push token (GITHUB_TOKEN) read from env at push time only,
    never written to .git/config.

What's NOT in this prototype (by design):
  - No payroll or salary data
  - No payment processing
  - No external messaging (email/SMS/push)
  - No real employee data — all @feghr.demo fictional accounts


================================================================================
12. KNOWN LIMITATIONS & FUTURE WORK
================================================================================

Known limitations:
  - Single-tenant (one company only)
  - No password reset / forgot password flow
  - No email verification (demo accounts have emailVerified=false)
  - Employee profile GET is readable by any signed-in user (browsable directory
    by design — see req 5 note in the audit)
  - No audit log for employee edits (only leave history is audited)
  - No CSV/export for attendance or leave reports
  - No recurring leave patterns (e.g., every Friday)
  - No leave carry-over between years

Potential future work:
  - Password reset via email (would require an email service)
  - Bulk attendance import (CSV)
  - Leave carry-over policy
  - Multi-tenant support
  - Mobile app (currently mobile-responsive web only)
  - Performance reviews module
  - Document uploads (offer letters, ID proofs)


================================================================================
13. FILE STRUCTURE
================================================================================

  demo-hr/
  ├── .env.local                    # Local env (gitignored — you create this)
  ├── .gitignore
  ├── package.json
  ├── vitest.config.js
  ├── next.config.ts
  ├── tailwind.config.ts
  ├── eslint.config.mjs
  ├── README-DOCUMENTATION.txt      # This file
  │
  ├── scripts/
  │   ├── seed.mjs                  # Seed 10 demo employees + Better Auth accounts
  │   ├── check-db.js               # Atlas connection test
  │   ├── verify-seed.mjs           # Verify seeded users have role + employeeId
  │   ├── smoke-db.mjs              # Mongoose data layer smoke test
  │   └── git-push.mjs              # Push to GitHub using GITHUB_TOKEN from env
  │
  ├── src/
  │   ├── app/
  │   │   ├── layout.jsx            # Root layout (fonts, HeroUI providers)
  │   │   ├── page.jsx              # Root page (login ↔ app shell branching)
  │   │   ├── globals.css           # Tailwind v4 + HeroUI v3 wiring
  │   │   └── api/
  │   │       ├── auth/[...all]/route.js          # Better Auth handler
  │   │       ├── employees/route.js              # GET list, POST create
  │   │       ├── employees/[id]/route.js         # GET, PATCH, DELETE
  │   │       ├── attendance/route.js             # GET self/team, POST check-in/out
  │   │       ├── leave/route.js                  # GET self/pending, POST apply
  │   │       ├── leave/[id]/route.js             # GET detail, PATCH cancel
  │   │       ├── leave/[id]/action/route.js      # POST approve/reject
  │   │       ├── notifications/route.js          # GET list, POST mark-all-read
  │   │       ├── notifications/[id]/route.js     # PATCH mark-one-read
  │   │       ├── notifications/unread-count/route.js
  │   │       └── dashboard/route.js              # GET role-aware dashboard data
  │   │
  │   ├── components/
  │   │   ├── AppShell.jsx          # Main shell (view switching, nav state)
  │   │   ├── Sidebar.jsx           # Responsive sidebar (desktop + mobile drawer)
  │   │   ├── Topbar.jsx            # Top bar (hamburger, title, bell, user chip)
  │   │   ├── LoginClient.jsx       # HeroUI login form with quick-fill chips
  │   │   ├── SignOutButton.jsx     # Client sign-out via Better Auth
  │   │   ├── Providers.jsx         # HeroUI RouterProvider wrapper
  │   │   ├── Icons.jsx             # Inline SVG icon set (no lucide dep)
  │   │   └── views/
  │   │       ├── DashboardView.jsx       # Role-aware dashboard with Recharts
  │   │       ├── DirectoryView.jsx       # Employee directory + profile + edit
  │   │       ├── AttendanceView.jsx      # Check-in/out + team view
  │   │       ├── LeaveView.jsx           # Apply form + my requests + balance
  │   │       ├── ApprovalsView.jsx       # Pending approvals queue
  │   │       ├── NotificationsView.jsx   # Notification list + mark-read
  │   │       └── ViewPlaceholder.jsx     # (legacy — unused after all views built)
  │   │
  │   └── lib/
  │       ├── auth.js               # Better Auth config + MongoDB adapter
  │       ├── auth-client.js        # Browser auth client
  │       ├── auth-helpers.js       # getSessionUser, requireUser, requireRole
  │       ├── nav.js                # Role-aware nav config
  │       ├── zod-schemas.js        # Shared Zod validation schemas
  │       ├── leave-engine.js       # Pure leave business logic (state machine)
  │       ├── attendance.js         # Asia/Dhaka date/time helpers
  │       ├── notifications.js      # Dedup-safe notification creation
  │       ├── seed/
  │       │   └── seed-data.js      # FegHR Demo org chart (10 people)
  │       └── db/
  │           ├── connect.js        # Cached Mongoose connection
  │           ├── index.js          # Barrel export
  │           └── models/
  │               ├── Employee.js
  │               ├── Attendance.js
  │               ├── LeaveRequest.js
  │               ├── LeaveBalance.js
  │               ├── Notification.js
  │               └── User.js       # Read-only view over Better Auth's user collection
  │
  └── tests/
      └── leave-engine.test.js      # 59 Vitest business-rule tests


================================================================================
                              END OF DOCUMENT
================================================================================
