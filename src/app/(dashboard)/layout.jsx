/**
 * @file src/app/(dashboard)/layout.jsx
 * @description Authenticated server layout enforcing Supabase Auth session and active workspace membership.
 */

import { redirect } from 'next/navigation';

import { DashboardShell } from '../../components/layout/DashboardShell.jsx';
import { getSupabaseAdminClient } from '../../lib/supabase/admin.js';
import { createSupabaseServerClient } from '../../lib/supabase/server.js';
import { getOrganizationById } from '../../repositories/organizations.repo.js';
import { getActiveProfileById } from '../../repositories/users.repo.js';

export const dynamic = 'force-dynamic';

/**
 * Authenticated layout for `/dashboard` and `/settings`.
 *
 * @description Verifies the Supabase session server-side, loads the active `user_profiles` and `organizations`
 * records, redirects unauthenticated visitors to `/login`, and mounts `DashboardShell`.
 * @param {{ children: import('react').ReactNode }} props - Child route segment.
 * @returns {Promise<import('react').ReactElement>} Authenticated workspace layout.
 * @throws {Error} Redirects to `/login` when session or workspace profile is missing.
 */
export default async function DashboardLayout({ children }) {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.auth.getUser();

  if (error || !data?.user) {
    redirect('/login');
  }

  const actor = await getActiveProfileById(db, data.user.id);
  if (!actor) {
    redirect('/login');
  }

  const adminDb = getSupabaseAdminClient();
  const org = await getOrganizationById(adminDb, actor.usr_org_id);
  if (!org) {
    redirect('/login');
  }

  const safeOrg = {
    org_id: org.org_id,
    org_name: org.org_name,
    org_domain: org.org_domain,
    org_subscription_tier: org.org_subscription_tier,
  };

  return (
    <DashboardShell actor={actor} organization={safeOrg}>
      {children}
    </DashboardShell>
  );
}
