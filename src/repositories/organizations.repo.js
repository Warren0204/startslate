/**
 * @file src/repositories/organizations.repo.js
 * @description Data access layer for `public.organizations` (`org_` prefixed columns) and atomic quota RPCs.
 */

import { AppError, ConflictError } from '../lib/errors.js';

const ORG_COLUMNS = [
  'org_id',
  'org_name',
  'org_domain',
  'org_subscription_tier',
  'org_monthly_hires_used',
  'org_monthly_hires_limit',
  'org_quota_reset_at',
  'org_it_webhook_url',
  'org_it_webhook_secret_enc',
  'org_it_rules_json',
  'org_dpo_email',
  'org_retention_days',
  'org_created_at',
  'org_updated_at',
].join(', ');

/**
 * Fetches an organization by its UUID.
 *
 * @description Server-side lookup used by services to inspect tier, IT rules, and webhook settings.
 * @param {import('@supabase/supabase-js').SupabaseClient} adminDb - Service-role Supabase client.
 * @param {string} orgId - Organization UUID.
 * @returns {Promise<object|null>} Organization row or `null`.
 * @throws {AppError} DB_QUERY_FAILED (500) on database failure.
 */
export async function getOrganizationById(adminDb, orgId) {
  const { data, error } = await adminDb
    .from('organizations')
    .select(ORG_COLUMNS)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) {
    throw new AppError('Failed to load organization record.', 'DB_QUERY_FAILED', 500);
  }

  return data ?? null;
}

/**
 * Finds an organization by its normalized corporate domain.
 *
 * @description Used during signup to prevent duplicate workspaces for the same corporate domain.
 * @param {import('@supabase/supabase-js').SupabaseClient} adminDb - Service-role Supabase client.
 * @param {string} domain - Lowercase corporate domain (e.g., `acmecorp.ph`).
 * @returns {Promise<object|null>} Matching organization row or `null`.
 * @throws {AppError} DB_QUERY_FAILED (500) on database failure.
 */
export async function findOrganizationByDomain(adminDb, domain) {
  const { data, error } = await adminDb
    .from('organizations')
    .select('org_id, org_name, org_domain')
    .eq('org_domain', domain.toLowerCase())
    .maybeSingle();

  if (error) {
    throw new AppError('Failed to check organization domain.', 'DB_QUERY_FAILED', 500);
  }

  return data ?? null;
}

/**
 * Creates a new tenant organization on the `free_trial` tier.
 *
 * @description Persists `organizations` row with `org_subscription_tier = 'free_trial'` and default monthly quota.
 * @param {import('@supabase/supabase-js').SupabaseClient} adminDb - Service-role Supabase client.
 * @param {{ org_name: string, org_domain: string, org_dpo_email?: string|null }} payload - New tenant fields.
 * @returns {Promise<object>} Newly created organization row.
 * @throws {ConflictError} DOMAIN_ALREADY_REGISTERED (409) when the domain already exists.
 * @throws {AppError} DB_WRITE_FAILED (500) on other database failures.
 */
export async function createOrganization(adminDb, payload) {
  const { data, error } = await adminDb
    .from('organizations')
    .insert({
      org_name: payload.org_name,
      org_domain: payload.org_domain.toLowerCase(),
      org_subscription_tier: 'free_trial',
      org_monthly_hires_used: 0,
      org_monthly_hires_limit: 3,
      org_dpo_email: payload.org_dpo_email ?? null,
    })
    .select(ORG_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new ConflictError(
        'A StartSlate workspace already exists for this corporate domain.',
        'DOMAIN_ALREADY_REGISTERED'
      );
    }
    throw new AppError('Failed to create organization workspace.', 'DB_WRITE_FAILED', 500);
  }

  return data;
}

/**
 * Atomically consumes one monthly hire slot if `org_monthly_hires_used < org_monthly_hires_limit`.
 *
 * @description Invokes the `consume_org_hire_quota` Postgres RPC (service_role only).
 * @param {import('@supabase/supabase-js').SupabaseClient} adminDb - Service-role Supabase client.
 * @param {string} orgId - Organization UUID.
 * @returns {Promise<{ org_monthly_hires_used: number, org_monthly_hires_limit: number, org_subscription_tier: string }|null>} Updated quota row or `null` when exhausted.
 * @throws {AppError} DB_RPC_FAILED (500) on RPC execution failure.
 */
export async function consumeOrgHireQuota(adminDb, orgId) {
  const { data, error } = await adminDb.rpc('consume_org_hire_quota', { p_org_id: orgId });
  if (error) {
    throw new AppError('Failed to evaluate organization hire quota.', 'DB_RPC_FAILED', 500);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

/**
 * Refunds one monthly hire slot when hire ingestion fails after quota reservation.
 *
 * @description Invokes the compensating `release_org_hire_quota` Postgres RPC.
 * @param {import('@supabase/supabase-js').SupabaseClient} adminDb - Service-role Supabase client.
 * @param {string} orgId - Organization UUID.
 * @returns {Promise<void>} Resolves once the quota refund completes.
 * @throws {Error} Never throws; best-effort compensation logs failures without masking the root error.
 */
export async function releaseOrgHireQuota(adminDb, orgId) {
  try {
    await adminDb.rpc('release_org_hire_quota', { p_org_id: orgId });
  } catch {
    console.error('[StartSlate] Quota refund failed for org', orgId);
  }
}

/**
 * Updates allowed organization configuration fields (webhook URL/secret, IT rules, DPO email, retention).
 *
 * @description Server-side update bound strictly to `org_id`.
 * @param {import('@supabase/supabase-js').SupabaseClient} adminDb - Service-role Supabase client.
 * @param {string} orgId - Organization UUID.
 * @param {object} patch - Prefixed `org_*` columns to update.
 * @returns {Promise<object>} Updated organization row.
 * @throws {AppError} DB_WRITE_FAILED (500) on update failure.
 */
export async function updateOrganizationConfig(adminDb, orgId, patch) {
  const { data, error } = await adminDb
    .from('organizations')
    .update(patch)
    .eq('org_id', orgId)
    .select(ORG_COLUMNS)
    .single();

  if (error || !data) {
    throw new AppError('Failed to update organization settings.', 'DB_WRITE_FAILED', 500);
  }

  return data;
}
