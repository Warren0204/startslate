/**
 * @file src/app/portal/[token]/page.jsx
 * @description Mobile-first passwordless candidate self-service portal validating token hash and expiry server-side.
 */

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock, Layers, Lock } from 'lucide-react';

import { CandidatePortalForm } from '../../../components/portal/CandidatePortalForm.jsx';
import { Card, CardContent } from '../../../components/ui/card.jsx';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin.js';
import { getCandidatePortalSession } from '../../../services/onboarding.service.js';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Candidate Onboarding Portal',
  robots: { index: false, follow: false },
};

/**
 * Passwordless mobile-first candidate onboarding portal (`/portal/[token]`).
 *
 * @description Validates the opaque portal token hash and `hire_portal_token_expires_at` server-side via
 * `getCandidatePortalSession` and renders either the self-service submission form or a safe status card.
 * @param {{ params: Promise<{ token: string }> }} props - Next.js dynamic route props.
 * @returns {Promise<import('react').ReactElement>} Mobile-responsive candidate portal page.
 * @throws {Error} Never throws on invalid/expired tokens; renders user-friendly status cards.
 */
export default async function CandidatePortalPage({ params }) {
  const { token } = await params;

  let session = { state: 'invalid' };
  try {
    const adminDb = getSupabaseAdminClient();
    session = await getCandidatePortalSession({ adminDb, rawToken: token });
  } catch {
    session = { state: 'invalid' };
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Compact Mobile-First Slate Navy Header */}
      <header className="bg-slate-900 px-4 py-4 text-white shadow-sm">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <Layers className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-bold leading-none">StartSlate</p>
              <p className="mt-0.5 text-[11px] text-slate-400">Secure Candidate Portal</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
            <Lock className="h-3 w-3" />
            AES-256-GCM
          </span>
        </div>
      </header>

      <main className="mx-auto mt-6 max-w-lg px-4">
        {session.state === 'valid' && session.offerSummary ? (
          <CandidatePortalForm token={token} offerSummary={session.offerSummary} />
        ) : session.state === 'completed' ? (
          <Card>
            <CardContent className="flex flex-col items-center p-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <h1 className="mt-4 text-lg font-bold text-slate-900">Already Submitted</h1>
              <p className="mt-2 text-sm text-slate-600">
                Your onboarding documents have already been received and this one-time link has been closed.
              </p>
            </CardContent>
          </Card>
        ) : session.state === 'expired' ? (
          <Card>
            <CardContent className="flex flex-col items-center p-8 text-center">
              <Clock className="h-12 w-12 text-amber-500" />
              <h1 className="mt-4 text-lg font-bold text-slate-900">Onboarding Link Expired</h1>
              <p className="mt-2 text-sm text-slate-600">
                For your data security under RA 10173, candidate onboarding links expire automatically. Please
                ask your HR coordinator to issue a fresh link.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center p-8 text-center">
              <AlertTriangle className="h-12 w-12 text-rose-500" />
              <h1 className="mt-4 text-lg font-bold text-slate-900">Invalid Onboarding Link</h1>
              <p className="mt-2 text-sm text-slate-600">
                We could not verify this onboarding portal link. Double-check the URL from your HR welcome
                email or contact your recruiter.
              </p>
            </CardContent>
          </Card>
        )}

        <footer className="mt-8 text-center text-xs text-slate-400">
          Protected under Philippine Data Privacy Act (RA 10173) &bull;{' '}
          <Link href="/privacy" className="underline hover:text-slate-600">
            Privacy Notice
          </Link>
        </footer>
      </main>
    </div>
  );
}
