/**
 * @file src/components/layout/SiteFooter.jsx
 * @description Public footer with StartSlate brand identity, RA 10173 trust note, and legal page links.
 */

import Link from 'next/link';
import { Layers, ShieldCheck } from 'lucide-react';

/**
 * Global public site footer for StartSlate.
 *
 * @description Renders brand summary, product links, and RA 10173 / B2B compliance navigation.
 * @param {void} _unused - Takes no props.
 * @returns {import('react').ReactElement} Footer element.
 * @throws {Error} Never throws.
 */
export function SiteFooter(_unused) {
  return (
    <footer className="border-t border-slate-200 bg-slate-900 text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <Layers className="h-4 w-4" />
              </span>
              <span className="text-lg font-bold text-white">StartSlate</span>
            </div>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">
              A clean slate for every new hire. Automated Offer Letter parsing, Human-in-the-Loop verification,
              passwordless mobile candidate onboarding, and zero-PII IT provisioning.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Engineered for Philippine Data Privacy Act (RA 10173) Compliance
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Platform</h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/#demo" className="hover:text-white">
                  Offer Letter Demo
                </Link>
              </li>
              <li>
                <Link href="/#pricing" className="hover:text-white">
                  Hybrid Pricing
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-white">
                  Workspace Sign In
                </Link>
              </li>
              <li>
                <Link href="/signup" className="hover:text-white">
                  Corporate Signup
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Compliance & Legal
            </h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/privacy" className="hover:text-white">
                  Privacy Notice (RA 10173)
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white">
                  B2B Terms & DPA
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-800 pt-6 text-xs text-slate-500 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} StartSlate Technologies. All rights reserved.</p>
          <p>AES-256-GCM PII Encryption &bull; 60s Expiring Signed URLs &bull; Multi-Tenant RLS</p>
        </div>
      </div>
    </footer>
  );
}
