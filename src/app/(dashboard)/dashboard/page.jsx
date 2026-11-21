/**
 * @file src/app/(dashboard)/dashboard/page.jsx
 * @description Role-aware HR & IT Dashboard server page loading quota, hires (redacted by role), and IT tasks.
 */

import { redirect } from 'next/navigation';

import { DashboardWorkspace } from '../../../components/dashboard/DashboardWorkspace.jsx';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin.js';
import { createSupabaseServerClient } from '../../../lib/supabase/server.js';
import { listHires } from '../../../repositories/hires.repo.js';
import { getOrganizationById } from '../../../repositories/organizations.repo.js';
import { listOrgTasks } from '../../../repositories/tasks.repo.js';
import { getActiveProfileById } from '../../../repositories/users.repo.js';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Dashboard',
};

/**
 * Authenticated role-aware onboarding dashboard page (`/dashboard`).
 *
 * @description Queries role-redacted hires (`hires.repo.js`), scoped IT tasks (`tasks.repo.js`), and tenant
 * usage quota (`organizations.repo.js`), passing sanitized state into `DashboardWorkspace`.
 * @param {void} _unused - Takes no props.
 * @returns {Promise<import('react').ReactElement>} Dashboard page element.
 * @throws {Error} Redirects to `/login` if session is invalid.
 */
export default async function DashboardPage(_unused) {
  const db = await createSupabaseServerClient();
  const { data } = await db.auth.getUser();
  if (!data?.user) {
    redirect('/login');
  }

  const actor = await getActiveProfileById(db, data.user.id);
  if (!actor) {
    redirect('/login');
  }

  const adminDb = getSupabaseAdminClient();
  const [org, hires, tasks] = await Promise.all([
    getOrganizationById(adminDb, actor.usr_org_id),
    listHires(db, actor, { limit: 100 }),
    listOrgTasks(db, actor, { limit: 150 }),
  ]);

  if (!org) {
    redirect('/login');
  }

  const safeOrg = {
    org_id: org.org_id,
    org_name: org.org_name,
    org_domain: org.org_domain,
    org_subscription_tier: org.org_subscription_tier,
    org_monthly_hires_used: org.org_monthly_hires_used,
    org_monthly_hires_limit: org.org_monthly_hires_limit,
    org_quota_reset_at: org.org_quota_reset_at,
  };

  return (
    <DashboardWorkspace
      actor={actor}
      organization={safeOrg}
      initialHires={hires}
      initialTasks={tasks}
    />
  );
}
