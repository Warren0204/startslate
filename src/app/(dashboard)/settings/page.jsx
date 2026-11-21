/**
 * @file src/app/(dashboard)/settings/page.jsx
 * @description Server page for `/settings` loading sanitized organization settings and team directory.
 */

import { redirect } from 'next/navigation';

import { SettingsWorkspace } from '../../../components/settings/SettingsWorkspace.jsx';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin.js';
import { createSupabaseServerClient } from '../../../lib/supabase/server.js';
import { getActiveProfileById } from '../../../repositories/users.repo.js';
import { getWorkspaceSettings } from '../../../services/settings.service.js';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Workspace Settings',
};

/**
 * Workspace settings server page (`/settings`).
 *
 * @description Resolves authenticated user profile, loads sanitized organization & team state via `getWorkspaceSettings`,
 * and renders `SettingsWorkspace`.
 * @param {void} _unused - Takes no props.
 * @returns {Promise<import('react').ReactElement>} Settings page element.
 * @throws {Error} Redirects to `/login` if session is missing.
 */
export default async function SettingsPage(_unused) {
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
  const { organization, members } = await getWorkspaceSettings({ db, adminDb, actor });

  return (
    <SettingsWorkspace
      actor={actor}
      organization={organization}
      initialMembers={members}
    />
  );
}
