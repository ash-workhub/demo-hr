// scripts/create-release.mjs
// Creates a GitHub Release attached to the v1.0.0 tag.
// Run once: node scripts/create-release.mjs
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
const envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim();
}

const token = env.GITHUB_TOKEN;
if (!token) {
  console.error('FAIL: GITHUB_TOKEN not found in .env.local');
  process.exit(2);
}

const OWNER = 'ash-workhub';
const REPO = 'demo-hr';
const TAG = 'v1.0.0';

const body = `# FegHR V1 — HR Prototype (Complete)

A fictional-data HR prototype for "FegHR Demo" company (timezone: Asia/Dhaka).

## 6 Modules
- **Employee Directory** — searchable list, profiles, role-aware edit
- **Daily Attendance** — check-in/out, self history, team view for managers
- **Leave Requests** — apply, track status, view balance, half-day support
- **Approvals** — Manager → HR two-stage approval chain with audit trail
- **In-app Notifications** — deduplicated, deep-linking, mark-as-read
- **Role-aware Dashboard** — Recharts visualizations (3 role variants)

## Tech Stack
Next.js 16 (JavaScript) · MongoDB Atlas · Better Auth · HeroUI v3 · Recharts · Zod · Vitest

## Demo Accounts
Password for all: \`FegHR-Demo-2026!\`

| Role | Email | Name |
|---|---|---|
| admin | admin@feghr.demo | Aria Hossain |
| hr | hr@feghr.demo | Nadia Rahman |
| manager | mgr.eng@feghr.demo | Tanvir Ahmed |
| manager | mgr.sales@feghr.demo | Sadia Islam |
| employee | emp1–emp6@feghr.demo | 6 employees |

## What's Verified
- ✅ All 12 audit requirements met (7 fully + 5 gap-fixed)
- ✅ 59/59 Vitest tests pass
- ✅ ESLint clean (0 errors, 0 warnings)
- ✅ End-to-end browser-tested (all 6 features, all 4 roles)
- ✅ Mobile responsive + sticky footer
- ✅ No console errors

## Key Features
- **Leave state machine**: \`pending_manager → pending_hr → approved\` (or rejected/cancelled)
- **Overlap detection**: rejects leaves overlapping with active/approved leaves
- **Pending balance reservation**: pending leaves reserve balance, preventing overbooking
- **Self-approval blocked**: even HR/admin can't approve their own leave
- **Notification dedup**: unique DB index on (userId, type, relatedId)
- **Server-enforced permissions**: every API route checks auth + role
- **Asia/Dhaka timezone**: attendance dates, late threshold (09:30)

## Documentation
See [\`README-DOCUMENTATION.txt\`](./README-DOCUMENTATION.txt) for the full 13-section docs covering setup, all roles, API reference, business rules, and file structure.

## Security Notes
- All credentials are fictional demo data
- Rotate the Atlas password and BETTER_AUTH_SECRET after prototype use
- Delete the GitHub PAT used for pushing
- No real employee/payroll/payment data in this prototype`;

const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    tag_name: TAG,
    name: 'FegHR V1 — HR Prototype',
    body,
    draft: false,
    prerelease: false,
    make_latest: 'true',
  }),
});

const data = await res.json();
if (res.ok) {
  console.log('OK: Release created');
  console.log('URL:', data.html_url);
  console.log('ID:', data.id);
} else {
  console.error('FAIL:', res.status, data.message);
  if (data.errors) console.error(JSON.stringify(data.errors, null, 2));
  process.exit(1);
}
