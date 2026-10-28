// src/components/SignOutButton.jsx
// Small client component that calls Better Auth's sign-out endpoint, then refreshes.
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client.js';

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handle() {
    setBusy(true);
    try {
      await authClient.signOut();
    } catch {
      // ignore — refresh anyway
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      className="px-4 py-2 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-sm font-medium text-slate-700 disabled:opacity-60"
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
