/**
 * @file src/app/privacy/page.jsx
 * @description Philippine Data Privacy Act (RA 10173) Privacy Notice and technical safeguards disclosure page.
 */

import Link from 'next/link';
import { Lock, ShieldCheck } from 'lucide-react';

import { SiteFooter } from '../../components/layout/SiteFooter.jsx';
import { SiteHeader } from '../../components/layout/SiteHeader.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.jsx';

export const metadata = {
  title: 'Privacy Notice (RA 10173)',
  description:
    'StartSlate Philippine Data Privacy Act of 2012 (RA 10173) compliance notice, security controls, and data subject rights.',
};

/**
 * Philippine Data Privacy Act (RA 10173) compliance & privacy notice page.
 *
 * @description Explains PIC/PIP roles, lawful basis, AES-256-GCM encryption, retention rules, and NPC data subject rights.
 * @param {void} _unused - Takes no props.
 * @returns {import('react').ReactElement} Privacy notice page.
 * @throws {Error} Never throws.
 */
export default function PrivacyPage(_unused) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Badge variant="emerald">
            <ShieldCheck className="h-3.5 w-3.5" />
            Republic Act No. 10173 (Philippine Data Privacy Act of 2012)
          </Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            StartSlate Privacy Notice &amp; Data Protection Controls
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Effective Version: <code className="rounded bg-slate-200 px-1.5 py-0.5">ra10173-v1</code> &bull;
            Last Updated: November 2026
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>1. Personal Information Controller (PIC) vs. Processor (PIP)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed text-slate-700">
              <p>
                Under RA 10173 and its Implementing Rules and Regulations (IRR), the subscribing employer
                organization using StartSlate acts as the <strong>Personal Information Controller (PIC)</strong>{' '}
                and determines the lawful purposes, retention period, and internal role access for candidate and
                new-hire records.
              </p>
              <p>
                <strong>StartSlate</strong> operates strictly as a{' '}
                <strong>Personal Information Processor (PIP)</strong>, processing Offer Letters, Government ID
                details, and IT provisioning metadata solely on documented instructions from the PIC.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Personal &amp; Sensitive Personal Information Collected</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed text-slate-700">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong>Offer Letter Metadata:</strong> Candidate full name, personal email, job title,
                  department, expected start date, and base salary (accessible strictly to authorized{' '}
                  <code>org_admin</code> and <code>hr_admin</code> users).
                </li>
                <li>
                  <strong>Sensitive Personal Information (Sec. 3(l)):</strong> Government-issued identification
                  images and identification numbers uploaded via the passwordless candidate portal only after
                  explicit, timestamped consent is recorded.
                </li>
                <li>
                  <strong>Ephemeral Public Demo Isolation:</strong> Files tested in the no-signup landing page
                  demo are processed strictly in volatile memory and are never persisted to database tables or
                  storage buckets.
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-emerald-600" />
                3. Technical &amp; Organizational Safeguards (Sec. 20)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm leading-relaxed text-slate-700">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong>AES-256-GCM Field-Level Encryption:</strong> Government ID numbers and webhook secrets
                  are encrypted with unique random 12-byte IVs and tenant-bound Additional Authenticated Data.
                </li>
                <li>
                  <strong>Role-Based Automatic Redaction:</strong> Database views and repository guards strip
                  compensation, Gov ID storage paths, and extracted PII whenever queried by <code>it_admin</code>{' '}
                  or <code>department_manager</code>.
                </li>
                <li>
                  <strong>Private Document Vault:</strong> All files reside in a private Supabase Storage bucket
                  (<code>onboarding-docs</code>) accessed exclusively via 60-second expiring Signed URLs.
                </li>
                <li>
                  <strong>Immutable Audit Logging:</strong> Every PII view, HITL verification, and packet
                  generation event is written to an append-only audit ledger protected by PostgreSQL rules
                  revoking <code>UPDATE</code> and <code>DELETE</code>.
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>4. Data Subject Rights (Sec. 16) &amp; Sub-Processors</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed text-slate-700">
              <p>
                Candidates and employees may exercise their rights to be informed, access, object, rectify,
                erase, block, or request data portability by contacting their employer&apos;s designated Data
                Protection Officer (DPO). StartSlate provides HR administrators with HITL rectification tools and
                PII erasure controls aligned with configurable organization retention policies.
              </p>
              <p>
                <strong>Authorized Sub-Processors:</strong> Supabase (PostgreSQL database with RLS, Auth, and
                private encrypted storage) and Google Gemini API (structured document extraction under paid
                enterprise zero-training terms).
              </p>
              <p>
                <strong>Breach Notification (NPC Circular 16-03):</strong> StartSlate notifies affected PICs
                without undue delay to support mandatory 72-hour National Privacy Commission and data-subject
                reporting windows.
              </p>
              <p className="pt-2 text-xs text-slate-500">
                Review our contractual obligations in the{' '}
                <Link href="/terms" className="font-medium text-emerald-600 underline">
                  B2B Terms of Service &amp; DPA
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
