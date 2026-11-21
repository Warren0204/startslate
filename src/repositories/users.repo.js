/**
 * @file src/repositories/users.repo.js
 * @description Data access layer for `public.user_profiles` (`usr_` prefixed columns).
 */

import { AppError } from '../lib/errors.js';

const USER_PROFILE_COLUMNS =
  'usr_id, usr_org_id, usr_email, usr_full_name, usr_role, usr_department_name, usr_status, usr_created_at, usr_updated_at';

/**
 * Fetches an active user profile by Supabase Auth user UUID.
 *
 * @description Queries `user_profiles` using the caller's RLS-bound session client.
 * @param {import('@supabase/supabase-js').SupabaseClient} db - User-session Supabase client.
 * @param {string} userId - Supabase `auth.users.id` UUID.
 * @returns {Promise<object|null>} Active `user_profiles` row or `null` when not found/inactive.
 * @throws {AppError} DB_QUERY_FAILED (500) on unexpected database errors.
 */
export async function getActiveProfileById(db, userId) {
  const { data, error } = await db
    .from('user_profiles')
    .select(USER_PROFILE_COLUMNS)
    .eq('usr_id', userId)
    .eq('usr_status', 'active')
    .maybeSingle();

  if (error) {
    throw new AppError('Failed to load authenticated user profile.', 'DB_QUERY_FAILED', 500);
  }

  return data ?? null;
}

/**
 * Inserts a new `user_profiles` row during corporate workspace signup or team invitation.
 *
 * @description Writes strictly prefixed `usr_` columns via the service-role client.
 * @param {import('@supabase/supabase-js').SupabaseClient} adminDb - Service-role Supabase client.
 * @param {{ usr_id: string, usr_org_id: string, usr_email: string, usr_full_name: string, usr_role: string, usr_department_name?: string|null, usr_status?: string }} payload - Profile fields.
 * @returns {Promise<object>} Newly inserted `user_profiles` row.
 * @throws {AppError} DB_WRITE_FAILED (500) on insertion failure.
 */
export async function createUserProfile(adminDb, payload) {
  const { data, error } = await adminDb
    .from('user_profiles')
    .insert({
      usr_id: payload.usr_id,
      usr_org_id: payload.usr_org_id,
      usr_email: payload.usr_email,
      usr_full_name: payload.usr_full_name,
      usr_role: payload.usr_role,
      usr_department_name: payload.usr_department_name ?? null,
      usr_status: payload.usr_status ?? 'active',
    })
    .select(USER_PROFILE_COLUMNS)
    .single();

  if (error || !data) {
    throw new AppError('Failed to create user profile.', 'DB_WRITE_FAILED', 500);
  }

  return data;
}

/**
 * Lists all workspace user profiles within the authenticated caller's organization.
 *
 * @description Queries `user_profiles` via the RLS-bound user-session client.
 * @param {import('@supabase/supabase-js').SupabaseClient} db - User-session Supabase client.
 * @param {object} actor - Authenticated `user_profiles` row.
 * @returns {Promise<Array<object>>} Organization team members ordered by creation time.
 * @throws {AppError} DB_QUERY_FAILED (500) on database errors.
 */
export async function listOrgUserProfiles(db, actor) {
  const { data, error } = await db
    .from('user_profiles')
    .select(USER_PROFILE_COLUMNS)
    .eq('usr_org_id', actor.usr_org_id)
    .order('usr_created_at', { ascending: true });

  if (error) {
    throw new AppError('Failed to list organization team members.', 'DB_QUERY_FAILED', 500);
  }

  return data ?? [];
}

/**
 * Updates a team member's role, department, or status strictly within the specified organization.
 *
 * @description Uses service-role after RBAC verification to enforce `usr_org_id` scoping.
 * @param {import('@supabase/supabase-js').SupabaseClient} adminDb - Service-role Supabase client.
 * @param {string} orgId - Tenant organization UUID.
 * @param {string} targetUsrId - Target `user_profiles.usr_id` UUID.
 * @param {{ usr_role?: string, usr_department_name?: string|null, usr_status?: string }} patch - Fields to update.
 * @returns {Promise<object>} Updated `user_profiles` row.
 * @throws {AppError} DB_WRITE_FAILED (500) on update failure.
 */
export async function updateUserProfile(adminDb, orgId, targetUsrId, patch) {
  const { data, error } = await adminDb
    .from('user_profiles')
    .update(patch)
    .eq('usr_org_id', orgId)
    .eq('usr_id', targetUsrId)
    .select(USER_PROFILE_COLUMNS)
    .single();

  if (error || !data) {
    throw new AppError('Failed to update user profile.', 'DB_WRITE_FAILED', 500);
  }

  return data;
}
