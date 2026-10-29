#!/usr/bin/env node
// scripts/git-push.mjs
// Pushes current branch to GitHub using GITHUB_TOKEN from .env.local.
// The token is used only at push time — it is NEVER written to .git/config.
//
// Usage: node scripts/git-push.mjs [--force] [remote-branch]
//   --force           Force-push (needed for the initial squash push)
//   remote-branch     Branch on remote (default: current branch name)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// Load .env.local manually (no dotenv dep needed)
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

const args = process.argv.slice(2);
const force = args.includes('--force');
const remoteBranch = args.find((a) => !a.startsWith('--')) || execSync('git branch --show-current').toString().trim();
const remoteUrl = 'https://github.com/ash-workhub/demo-hr.git';

// Construct an authenticated URL with the token — used ONLY for this push.
// The token lives in the URL for the duration of this command, then is gone.
// It is NOT saved to .git/config (we push directly, not via a named remote).
const authedUrl = `https://x-access-token:${token}@github.com/ash-workhub/demo-hr.git`;

const flag = force ? ' --force' : '';
const cmd = `git push${flag} "${authedUrl}" HEAD:${remoteBranch}`;

console.log(`Pushing HEAD -> ${remoteUrl} (branch: ${remoteBranch})${force ? ' [force]' : ''}...`);
try {
  execSync(cmd, { stdio: 'inherit' });
  console.log('OK: push succeeded');
  process.exit(0);
} catch (e) {
  console.error('FAIL: push failed');
  process.exit(1);
}
