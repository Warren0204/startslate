/**
 * @file src/app/(auth)/signup/page.jsx
 * @description Corporate domain signup page enforcing StartSlate's public-webmail blocklist and Supabase Auth provisioning.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Building2, CheckCircle2, Layers, Loader2, ShieldCheck } from 'lucide-react';

import { Alert } from '../../../components/ui/alert.jsx';
import { Button } from '../../../components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../components/ui/card.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import { PUBLIC_WEBMAIL_DOMAINS } from '../../../lib/security/domainGuard.js';
import { createSupabaseBrowserClient } from '../../../lib/supabase/client.js';

/**
 * Corporate workspace registration page (`/signup`).
 *
 * @description Blocks consumer webmail domains inline, creates the org + `org_admin` via `POST /api/auth/signup`,
 * and signs the user into Supabase Auth.
 * @param {void} _unused - Takes no props.
 * @returns {import('react').ReactElement} Signup page.
 * @throws {Error} Never throws; validation and network errors are rendered inline.
 */
export default function SignupPage(_unused) {
  const router = useRouter();
  const [formState, setFormState] = useState({
    org_name: '',
    full_name: '',
    email: '',
    password: '',
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailDomain = formState.email.includes('@')
    ? formState.email.trim().toLowerCase().split('@').pop()
    : '';
  const isBlockedDomain = Boolean(emailDomain && PUBLIC_WEBMAIL_DOMAINS.has(emailDomain));

  /**
   * Handles corporate signup form submission.
   *
   * @description Calls `POST /api/auth/signup`, then initiates a Supabase Auth session and redirects to `/dashboard`.
   * @param {import('react').FormEvent<HTMLFormElement>} event - Form submission event.
   * @returns {Promise<void>} Resolves when registration completes.
   * @throws {Error} Caught internally and surfaced to the user.
   */
  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (isBlockedDomain) {
      setErrorMessage(
        `Public webmail domain "${emailDomain}" is blocked. Please register with your corporate work email.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formState),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        setErrorMessage(payload?.error?.message || 'Unable to create workspace.');
        return;
      }

      // Attempt immediate session sign-in if email confirmation is disabled in Supabase
      try {
        const supabase = createSupabaseBrowserClient();
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: formState.email.trim().toLowerCase(),
          password: formState.password,
        });
        if (!signInError) {
          router.push('/dashboard');
          router.refresh();
          return;
        }
      } catch {
        // Fallback to confirmation notice below
      }

      setSuccessMessage(
        `Workspace "${payload.data.organization.org_name}" created! Check your corporate inbox to confirm your email, then sign in.`
      );
    } catch {
      setErrorMessage('Network error during registration. Please try again.');
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
            <Building2 className="h-5 w-5 text-emerald-500" />
            Create your corporate workspace
          </CardTitle>
          <CardDescription>
            Start your Free Trial (3 hires/month). Corporate work email required — public webmail is blocked.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {errorMessage ? (
              <Alert variant="destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </Alert>
            ) : null}

            {successMessage ? (
              <Alert variant="emerald">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{successMessage}</span>
              </Alert>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="org_name">Company / Organization Name</Label>
              <Input
                id="org_name"
                required
                placeholder="Acme Philippines Corp."
                value={formState.org_name}
                onChange={(e) => setFormState((prev) => ({ ...prev, org_name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="full_name">Your Full Name</Label>
              <Input
                id="full_name"
                required
                placeholder="Maria Santos"
                value={formState.full_name}
                onChange={(e) => setFormState((prev) => ({ ...prev, full_name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Corporate Work Email</Label>
              <Input
                id="email"
                type="email"
                required
                placeholder="maria@acmecorp.ph"
                value={formState.email}
                onChange={(e) => setFormState((prev) => ({ ...prev, email: e.target.value }))}
                className={isBlockedDomain ? 'border-rose-400 focus-visible:ring-rose-500' : ''}
              />
              {isBlockedDomain ? (
                <p className="text-xs font-medium text-rose-600">
                  Public webmail ({emailDomain}) is not allowed. Use your company domain email.
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  Your domain becomes your tenant boundary for team invites and RLS isolation.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password (min. 12 characters)</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={12}
                placeholder="Enter a strong corporate password"
                value={formState.password}
                onChange={(e) => setFormState((prev) => ({ ...prev, password: e.target.value }))}
              />
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <span>
                By creating a workspace, you agree to our{' '}
                <Link href="/terms" className="font-medium text-slate-900 underline">
                  B2B Terms
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="font-medium text-slate-900 underline">
                  RA 10173 Privacy Notice
                </Link>
                .
              </span>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button
              type="submit"
              variant="emerald"
              className="w-full"
              disabled={isSubmitting || isBlockedDomain}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create Free Trial Workspace
            </Button>
            <p className="text-center text-xs text-slate-500">
              Already have a workspace?{' '}
              <Link href="/login" className="font-semibold text-slate-900 hover:underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
