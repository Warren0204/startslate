/**
 * @file src/app/(auth)/login/page.jsx
 * @description Corporate workspace login page wired to Supabase Auth (`signInWithPassword`).
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Layers, Loader2, Lock } from 'lucide-react';

import { Alert } from '../../../components/ui/alert.jsx';
import { Button } from '../../../components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../components/ui/card.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import { createSupabaseBrowserClient } from '../../../lib/supabase/client.js';

/**
 * Corporate workspace sign-in page (`/login`).
 *
 * @description Authenticates existing HR, IT, Org Admin, and Department Manager users via Supabase Auth.
 * @param {void} _unused - Takes no props.
 * @returns {import('react').ReactElement} Login page.
 * @throws {Error} Never throws; authentication errors render inline.
 */
export default function LoginPage(_unused) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Authenticates the user with Supabase Auth and redirects to `/dashboard`.
   *
   * @description Calls `supabase.auth.signInWithPassword` and refreshes Next.js server routes on success.
   * @param {import('react').FormEvent<HTMLFormElement>} event - Form submit event.
   * @returns {Promise<void>} Resolves once login succeeds or fails.
   * @throws {Error} Caught internally and displayed inline.
   */
  async function handleLogin(event) {
    event.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        setErrorMessage(error.message || 'Invalid work email or password.');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setErrorMessage('Authentication service unavailable. Verify Supabase environment variables.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <Link href="/" className="mb-6 flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-emerald-400 shadow-sm">
          <Layers className="h-5 w-5" />
        </span>
        <span className="text-xl font-bold tracking-tight text-slate-900">StartSlate</span>
      </Link>

      <Card className="w-full max-w-md shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-emerald-500" />
            Sign in to StartSlate
          </CardTitle>
          <CardDescription>
            Access your role-aware HR, IT Provisioning, or Department Manager workspace.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            {errorMessage ? (
              <Alert variant="destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </Alert>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="login_email">Corporate Email</Label>
              <Input
                id="login_email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="login_password">Password</Label>
              <Input
                id="login_password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" variant="default" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sign in to Workspace
            </Button>
            <p className="text-center text-xs text-slate-500">
              New company?{' '}
              <Link href="/signup" className="font-semibold text-emerald-600 hover:underline">
                Create a corporate workspace
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
