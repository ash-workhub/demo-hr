// scripts/create-v2-release.mjs
// Creates a GitHub Release attached to the v2.0.0 tag.
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
const TAG = 'v2.0.0';

const body = `# FegHR V2 — HR Prototype (Complete)

V2 extends V1 with 6 additive steps. All V1 features, data, and behavior preserved.

## V2 Steps

### Step 1: Organization Reference Records + Assignment History
- Branch/Department/Designation models (company-scoped, unique codes)
- Effective-dated EmployeeAssignment history (append-only, prior preserved)
- Manager role validation + self-manager/cycle detection

### Step 2: Attendance Policy Configuration + Review Queue + Corrections
- AttendancePolicy (workdays, start/end time, grace, late threshold)
- Holiday + EmployeeSchedule (per-employee overrides)
- AttendanceCorrection (audited, pending→confirmed→applied, raw punches immutable)
- AttendanceReview (HR flag queue, verdict = metadata only)

### Step 3: Leave Type Config + Adjustment Ledger + Statements + On-Behalf
- LeaveType model (isUnlimited flag, not numeric zero)
- LeaveAdjustment append-only ledger (signed amounts, actor audit)
- Balance reconciliation: remaining = quota + adjustments - used
- HR apply-on-behalf (records HR actor + employee separately)

### Step 4: Configurable Sequential Approval Policies
- ApprovalPolicy (0-5 manager stages + 1 final HR/Admin)
- Route snapshot frozen at submission (policy edits don't affect pending)
- Reassignment with expected-approver validation + append-only audit
- Final approval rechecks balance before decrementing

### Step 5: Company Notices
- Draft/published/archived lifecycle with author + publish + archive audit
- Per-recipient read state (private, session-scoped)
- Audience preview before publication
- In-app only — no external email/SMS/push

### Step 6: Reports + CSV Export
- Attendance + leave reports with date filters
- Role-filtered (employee=self, manager=team, hr/admin=all)
- Date-bounded (max 90 days), row-limited (500)
- CSV with RFC 4180 escaping + UTF-8 BOM

## Test Coverage
- 324 tests across 7 test files (leave, leave-balance, org, attendance, approval-policy, notice, report engines)
- All passing. Lint clean.

## V2 Acceptance
All 12 acceptance items verified and met. 1 defect found + fixed during regression (HR no-manager route resolution).

## Stack
Next.js 16 (JavaScript) · MongoDB Atlas · Better Auth · HeroUI v3 · Recharts · Zod · Vitest`;

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
    name: 'FegHR V2 — HR Prototype (Complete)',
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
} else {
  console.error('FAIL:', res.status, data.message);
  process.exit(1);
}
