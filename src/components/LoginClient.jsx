// src/components/LoginClient.jsx
// HeroUI v3 login form. Calls Better Auth's signIn.email endpoint, then router.refresh()
// so the server component re-evaluates the session.
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Input,
} from '@heroui/react';
import { authClient } from '@/lib/auth-client.js';

export default function LoginClient({ demoAccounts = [] }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState('idle'); // 'idle' | 'signing-in' | 'redirecting'
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    setPhase('signing-in');
    try {
      const res = await authClient.signIn.email({ email, password });
      if (res.error) {
        setError(res.error.message || 'Sign-in failed');
        setLoading(false);
        setPhase('idle');
        return;
      }
      // Sign-in succeeded — cookie is now set. Tell the user we're loading the app,
      // then trigger a server refresh so page.jsx re-evaluates the session.
      // Keep loading=true throughout so the button stays disabled and the user
      // sees feedback during the (sometimes slow) dev recompile.
      setPhase('redirecting');
      router.refresh();
      // Fallback: if router.refresh() didn't swap the page within 8s (e.g. due to
      // a cold dev recompile which can take 5s+ on first hit), force a full reload.
      // 8s is well above the worst observed cold-compile time (~5s) so this only
      // fires on genuine stalls, not normal slow compiles.
      setTimeout(() => {
        if (document.cookie.includes('better-auth.session_token')) {
          window.location.reload();
        }
      }, 8000);
    } catch (err) {
      setError(err.message || 'Network error');
      setLoading(false);
      setPhase('idle');
    }
    // NOTE: no finally { setLoading(false) } here — we stay loading until the
    // server component swaps us out (which unmounts this form entirely).
  }

  function quickFill(e) {
    setEmail(e);
    setPassword('FegHR-Demo-2026!');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white text-2xl font-bold mb-3 shadow-lg">
            F
          </div>
          <h1 className="text-2xl font-bold text-slate-900">FegHR V1</h1>
          <p className="text-sm text-slate-500 mt-1">HR prototype · FegHR Demo</p>
        </div>

        <Card className="shadow-xl border border-slate-200">
          <CardHeader className="px-6 pt-6 pb-0">
            <CardTitle className="text-lg">Sign in</CardTitle>
            <CardDescription className="text-sm text-slate-500">
              Use a demo account or your seeded credentials.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 py-4">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="login-email" className="text-sm font-medium text-slate-700">
                  Email
                </label>
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@feghr.demo"
                  variant="primary"
                  required
                  autoComplete="email"
                  className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="login-password" className="text-sm font-medium text-slate-700">
                  Password
                </label>
                <Input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  variant="primary"
                  required
                  autoComplete="current-password"
                  className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none"
                />
              </div>
              {error && (
                <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
                  {error}
                </div>
              )}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                isDisabled={loading}
                className="w-full bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {phase === 'redirecting' ? 'Loading app…' : loading ? 'Signing in…' : 'Sign in'}
              </Button>
              {phase === 'redirecting' && (
                <p className="text-center text-xs text-slate-500 -mt-1">
                  Session established — preparing your dashboard…
                </p>
              )}
            </form>
          </CardContent>
          {demoAccounts.length > 0 && (
            <CardFooter className="flex flex-col items-start gap-2 px-6 pb-6 pt-0">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Quick fill (demo)
              </p>
              <div className="flex flex-wrap gap-2">
                {demoAccounts.map((a) => (
                  <button
                    key={a.email}
                    type="button"
                    onClick={() => quickFill(a.email)}
                    className="text-xs px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </CardFooter>
          )}
        </Card>

        <p className="text-center text-xs text-slate-400 mt-6">
          FegHR V1 prototype · timezone Asia/Dhaka
        </p>
      </div>
    </div>
  );
}
