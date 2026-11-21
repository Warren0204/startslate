/**
 * @file src/components/layout/SiteHeader.jsx
 * @description Public marketing navigation header for StartSlate.
 */

import Link from 'next/link';
import { Layers, ShieldCheck } from 'lucide-react';

import { Button } from '../ui/button.jsx';

/**
 * Top navigation header shared across public landing and compliance pages.
 *
 * @description Displays the StartSlate logo, anchor navigation, and authentication links.
 * @param {void} _unused - Takes no props.
 * @returns {import('react').ReactElement} Sticky navigation header.
 * @throws {Error} Never throws.
 */
export function SiteHeader(_unused) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-emerald-400 shadow-sm">
            <Layers className="h-5 w-5" />
          </span>
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-slate-900">StartSlate</span>
            <span className="hidden text-[11px] text-slate-500 sm:block">
              A clean slate for every new hire.
            </span>
          </div>
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
          <Link href="/#demo" className="transition-colors hover:text-slate-900">
            Live Demo
          </Link>
          <Link href="/#features" className="transition-colors hover:text-slate-900">
            Features
          </Link>
          <Link href="/#pricing" className="transition-colors hover:text-slate-900">
            Pricing
          </Link>
          <Link
            href="/privacy"
            className="inline-flex items-center gap-1 transition-colors hover:text-slate-900"
          >
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            RA 10173 Privacy
          </Link>
        </nav>

        <div className="flex items-center gap-2.5">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button variant="emerald" size="sm" asChild>
            <Link href="/signup">Start Free Trial</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
