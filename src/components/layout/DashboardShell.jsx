/**
 * @file src/components/layout/DashboardShell.jsx
 * @description Role-aware authenticated navigation shell for StartSlate workspaces (`/dashboard` and `/settings`).
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Layers,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';

import { createSupabaseBrowserClient } from '../../lib/supabase/client.js';
import { Badge } from '../ui/badge.jsx';
import { Button } from '../ui/button.jsx';

const ROLE_LABELS = Object.freeze({
  org_admin: 'Org Admin',
  hr_admin: 'HR Admin',
  it_admin: 'IT Admin',
  department_manager: 'Dept. Manager',
});

/**
 * Authenticated Deep Slate Navy workspace shell with responsive sidebar and sign-out action.
 *
 * @description Displays tenant identity, role badge, primary workspace navigation, and mobile drawer.
 * @param {{ actor: object, organization: object, children: import('react').ReactNode }} props - Workspace shell props.
 * @returns {import('react').ReactElement} Authenticated page shell.
 * @throws {Error} Never throws.
 */
export function DashboardShell({ actor, organization, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: '/dashboard', label: 'Onboarding Pipeline', icon: LayoutDashboard },
    { href: '/settings', label: 'Workspace Settings', icon: Settings },
  ];

  /**
   * Signs the current user out of Supabase Auth and redirects to `/login`.
   *
   * @description Clears browser auth session cookies and refreshes router state.
   * @param {void} _unused - Takes no arguments.
   * @returns {Promise<void>} Resolves after redirect.
   * @throws {Error} Caught internally; redirects cleanly even on session expiry.
   */
  async function handleSignOut(_unused) {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // Proceed to login redirect regardless
    }
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between bg-slate-900 text-slate-200 lg:flex">
        <div>
          <div className="flex h-16 items-center gap-2.5 border-b border-slate-800 px-6">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <Layers className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">StartSlate</p>
              <p className="truncate text-[11px] text-slate-400">{organization.org_name}</p>
            </div>
          </div>

          <nav className="space-y-1 p-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-slate-800 p-4">
          <div className="rounded-lg bg-slate-800/70 p-3">
            <p className="truncate text-sm font-semibold text-white">{actor.usr_full_name}</p>
            <p className="truncate text-xs text-slate-400">{actor.usr_email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge
                variant="emerald"
                className="border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
              >
                {ROLE_LABELS[actor.usr_role] || actor.usr_role}
              </Badge>
              {actor.usr_department_name ? (
                <Badge
                  variant="outline"
                  className="border-slate-600 bg-slate-900 text-slate-300"
                >
                  {actor.usr_department_name}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <Link
              href="/privacy"
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              RA 10173
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Top Bar */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-slate-900 px-4 text-white lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <Layers className="h-4 w-4" />
            </span>
            <span className="font-bold">StartSlate</span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label="Toggle workspace navigation"
            className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>

        {mobileMenuOpen ? (
          <div className="border-b border-slate-800 bg-slate-900 px-4 pb-4 text-slate-200 lg:hidden">
            <nav className="space-y-1 pt-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
                  >
                    <Icon className="h-4 w-4 text-emerald-400" />
                    {item.label}
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-300 hover:bg-slate-800"
              >
                <LogOut className="h-4 w-4" />
                Sign out ({actor.usr_email})
              </button>
            </nav>
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
