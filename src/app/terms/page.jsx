/**
 * @file src/app/terms/page.jsx
 * @description B2B SaaS Terms of Service and Data Processing Agreement summary for StartSlate.
 */

import Link from 'next/link';
import { FileCheck2 } from 'lucide-react';

import { SiteFooter } from '../../components/layout/SiteFooter.jsx';
import { SiteHeader } from '../../components/layout/SiteHeader.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.jsx';

export const metadata = {
  title: 'B2B Terms of Service & DPA',
  description:
    'StartSlate B2B SaaS subscription terms, acceptable corporate use, hybrid quota billing, and Data Processing Agreement.',
};

/**
 * B2B Terms of Service and Data Processing Agreement summary page.
 *
 * @description Covers corporate workspace eligibility, hybrid subscription/credit billing, HITL responsibility, and DPA clauses.
 * @param {void} _unused - Takes no props.
 * @returns {import('react').ReactElement} Terms page.
 * @throws {Error} Never throws.
 */
export default function TermsPage(_unused) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Badge variant="secondary">
            <FileCheck2 className="h-3.5 w-3.5 text-emerald-600" />
            B2B SaaS Agreement &amp; Data Processing Terms
          </Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            StartSlate Terms of Service
          </h1>
          <p className="mt-2 text-sm text-slate-500">Effective Date: November 2026</p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>1. Corporate Workspace Eligibility</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-slate-700">
              StartSlate is a business-to-business platform restricted to verifiable corporate email domains.
              Registration using free consumer or disposable webmail providers is blocked automatically. The
              founding administrator represents that they have authority to bind their organization to these
              terms and assign least-privilege workspace roles (<code>org_admin</code>, <code>hr_admin</code>,{' '}
              <code>it_admin</code>, and <code>department_manager</code>).
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Hybrid Subscription Plans, Free Trial Watermarks &amp; Quotas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed text-slate-700">
              <p>
                Workspaces begin on the <strong>Free Trial</strong> tier with up to 3 active hires per month.
                Compiled onboarding PDF packets generated on the Free Trial tier include a diagonal{' '}
                <code>SAMPLE - FREE TRIAL</code> watermark and are intended strictly for evaluation.
              </p>
              <p>
                Paid plans (<strong>Starter</strong>, <strong>Growth</strong>) renew monthly with automatic
                quota resets. Optional <strong>Credit Packs</strong> provide supplemental onboarding credits that
                remain valid for 12 months from purchase.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. AI Extraction &amp; Human-in-the-Loop Responsibility</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-slate-700">
              StartSlate uses automated document extraction to accelerate HR operations and enforces a mandatory
              Human-in-the-Loop (HITL) verification gate whenever extraction confidence falls below 85%
              (<code>0.85</code>). The Customer organization remains solely responsible for final legal review
              of employment contracts, compensation terms, and identity verification prior to Day-1 onboarding.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>4. Security, Webhooks &amp; RA 10173 Data Processing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed text-slate-700">
              <p>
                Outbound IT provisioning webhooks must point to Customer-owned HTTPS endpoints and verify the
                cryptographic <code>X-StartSlate-Signature</code> header before executing automated directory or
                device workflows.
              </p>
              <p>
                Processing of personal and sensitive personal information is governed by our{' '}
                <Link href="/privacy" className="font-medium text-emerald-600 underline">
                  RA 10173 Privacy Notice &amp; Data Protection Controls
                </Link>
                , incorporated by reference as StartSlate&apos;s Data Processing Agreement.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
