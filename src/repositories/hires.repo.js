/**
 * @file src/repositories/hires.repo.js
 * @description Data access layer for `public.onboarding_hires` (`hire_` prefix) with automatic role-based PII redaction.
 */

import { AppError } from '../lib/errors.js';
import {
  ROLES,
  assertDepartmentScope,
  canViewHirePII,
  redactHireForRole,
} from '../lib/security/rbac.js';

const FULL_HIRE_COLUMNS = [
  'hire_id',
  'hire_org_id',
  'hire_created_by_usr_id',
  'hire_status',
  'hire_full_name',
  'hire_personal_email',
  'hire_work_email',
  'hire_job_title',
  'hire_department_name',
  'hire_start_date',
  'hire_employment_type',
  'hire_base_salary_amount',
  'hire_salary_currency',
  'hire_offer_letter_path',
  'hire_gov_id_image_path',
  'hire_gov_id_type',
  'hire_gov_id_number_enc',
  'hire_extracted_pii_json',
  'hire_ai_confidence_score',
  'hire_needs_hitl_review',
  'hire_hitl_reviewed_by_usr_id',
  'hire_hitl_reviewed_at',
  'hire_portal_token_expires_at',
  'hire_consent_accepted_at',
  'hire_consent_version',
  'hire_packet_pdf_path',
  'hire_created_at',
  'hire_updated_at',
].join(', ');

const REDACTED_HIRE_COLUMNS = [
  'hire_id',
  'hire_org_id',
  'hire_created_by_usr_id',
  'hire_status',
  'hire_full_name',
  'hire_work_email',
  'hire_job_title',
  'hire_department_name',
  'hire_start_date',
  'hire_employment_type',
  'hire_ai_confidence_score',
  'hire_needs_hitl_review',
  'hire_hitl_reviewed_by_usr_id',
  'hire_hitl_reviewed_at',
  'hire_consent_accepted_at',
  'hire_consent_version',
  'hire_created_at',
  'hire_updated_at',
].join(', ');

/**
 * Lists onboarding hires scoped to the caller's tenant and role, automatically redacting PII for IT & Managers.
 *
 * @description Queries `onboarding_hires` for `org_admin`/`hr_admin` and `onboarding_hires_redacted_v` for `it_admin`/`department_manager`,
 * applying `redactHireForRole` as defense-in-depth to guarantee `hire_base_salary_amount`, `hire_gov_id_image_path`,
 * and `hire_extracted_pii_json` are stripped for non-HR callers.
 * @param {import('@supabase/supabase-js').SupabaseClient} db - User-session Supabase client.
 * @param {object} actor - Authenticated `user_profiles` row.
 * @param {{ status?: string, department?: string, limit?: number }} [filters={}] - Optional list filters.
 * @returns {Promise<Array<object>>} Role-appropriate hire records.
 * @throws {AppError} DB_QUERY_FAILED (500) on query errors.
 */
export async function listHires(db, actor, filters = {}) {
  const hrAccess = canViewHirePII(actor);
  const relation = hrAccess ? 'onboarding_hires' : 'onboarding_hires_redacted_v';
  const columns = hrAccess ? FULL_HIRE_COLUMNS : REDACTED_HIRE_COLUMNS;

  let query = db
    .from(relation)
    .select(columns)
    .eq('hire_org_id', actor.usr_org_id)
    .order('hire_created_at', { ascending: false })
    .limit(Math.min(filters.limit ?? 50, 200));

  if (actor.usr_role === ROLES.DEPARTMENT_MANAGER && actor.usr_department_name) {
    query = query.ilike('hire_department_name', actor.usr_department_name);
  } else if (filters.department) {
    query = query.ilike('hire_department_name', filters.department);
  }

  if (filters.status) {
    query = query.eq('hire_status', filters.status);
  }

  const { data, error } = await query;
  if (error) {
    throw new AppError('Failed to list onboarding hires.', 'DB_QUERY_FAILED', 500);
  }

  return (data ?? []).map((row) => redactHireForRole(actor, row));
}

/**
 * Fetches a single onboarding hire by UUID for an authenticated actor, automatically redacting PII for non-HR roles.
 *
 * @description Uses `onboarding_hires_redacted_v` and `redactHireForRole` for `it_admin` and `department_manager`,
 * and enforces department scope for `department_manager`.
 * @param {import('@supabase/supabase-js').SupabaseClient} db - User-session Supabase client.
 * @param {object} actor - Authenticated `user_profiles` row.
 * @param {string} hireId - Onboarding hire UUID.
 * @returns {Promise<object|null>} Role-redacted hire record or `null` if not found.
 * @throws {AppError} DB_QUERY_FAILED (500) on query errors.
 */
export async function getHireById(db, actor, hireId) {
  const hrAccess = canViewHirePII(actor);
  const relation = hrAccess ? 'onboarding_hires' : 'onboarding_hires_redacted_v';
  const columns = hrAccess ? FULL_HIRE_COLUMNS : REDACTED_HIRE_COLUMNS;

  const { data, error } = await db
    .from(relation)
    .select(columns)
    .eq('hire_org_id', actor.usr_org_id)
    .eq('hire_id', hireId)
    .maybeSingle();

  if (error) {
    throw new AppError('Failed to fetch onboarding hire.', 'DB_QUERY_FAILED', 500);
  }
  if (!data) {
    return null;
  }

  assertDepartmentScope(actor, data);
  return redactHireForRole(actor, data);
}

/**
 * Fetches a full onboarding hire record via service-role for server-side HR workflows (after RBAC check).
 *
 * @description Always binds to `hire_org_id = orgId` to preserve strict tenant isolation.
 * @param {import('@supabase/supabase-js').SupabaseClient} adminDb - Service-role Supabase client.
 * @param {string} orgId - Tenant organization UUID.
 * @param {string} hireId - Onboarding hire UUID.
 * @returns {Promise<object|null>} Full hire record or `null`.
 * @throws {AppError} DB_QUERY_FAILED (500) on database failure.
 */
export async function getHireByIdAdmin(adminDb, orgId, hireId) {
  const { data, error } = await adminDb
    .from('onboarding_hires')
    .select(FULL_HIRE_COLUMNS)
    .eq('hire_org_id', orgId)
    .eq('hire_id', hireId)
    .maybeSingle();

  if (error) {
    throw new AppError('Failed to load onboarding hire.', 'DB_QUERY_FAILED', 500);
  }

  return data ?? null;
}

/**
 * Looks up a hire record by the SHA-256 hash of its passwordless candidate portal token.
 *
 * @description Used exclusively by `/api/portal/[token]/*` server workflows.
 * @param {import('@supabase/supabase-js').SupabaseClient} adminDb - Service-role Supabase client.
 * @param {string} tokenHash - 64-character lowercase SHA-256 hex digest of the raw portal token.
 * @returns {Promise<object|null>} Matching hire row or `null`.
 * @throws {AppError} DB_QUERY_FAILED (500) on database failure.
 */
export async function getHireByPortalTokenHash(adminDb, tokenHash) {
  const { data, error } = await adminDb
    .from('onboarding_hires')
    .select(FULL_HIRE_COLUMNS)
    .eq('hire_portal_token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    throw new AppError('Failed to resolve onboarding portal session.', 'DB_QUERY_FAILED', 500);
  }

  return data ?? null;
}

/**
 * Inserts a new `onboarding_hires` row using strictly prefixed `hire_` columns.
 *
 * @description Executed via service-role after HR RBAC check and atomic quota reservation.
 * @param {import('@supabase/supabase-js').SupabaseClient} adminDb - Service-role Supabase client.
 * @param {object} payload - Prefixed `hire_*` columns to persist.
 * @returns {Promise<object>} Newly created `onboarding_hires` row.
 * @throws {AppError} DB_WRITE_FAILED (500) on insertion failure.
 */
export async function createHire(adminDb, payload) {
  const { data, error } = await adminDb
    .from('onboarding_hires')
    .insert(payload)
    .select(FULL_HIRE_COLUMNS)
    .single();

  if (error || !data) {
    throw new AppError('Failed to create onboarding hire record.', 'DB_WRITE_FAILED', 500);
  }

  return data;
}

/**
 * Updates an existing `onboarding_hires` row strictly scoped to `orgId`.
 *
 * @description Applies a partial `hire_*` update and returns the refreshed row.
 * @param {import('@supabase/supabase-js').SupabaseClient} adminDb - Service-role Supabase client.
 * @param {string} orgId - Tenant organization UUID.
 * @param {string} hireId - Onboarding hire UUID.
 * @param {object} patch - Prefixed `hire_*` columns to update.
 * @returns {Promise<object>} Updated `onboarding_hires` row.
 * @throws {AppError} DB_WRITE_FAILED (500) on update failure.
 */
export async function updateHire(adminDb, orgId, hireId, patch) {
  const { data, error } = await adminDb
    .from('onboarding_hires')
    .update(patch)
    .eq('hire_org_id', orgId)
    .eq('hire_id', hireId)
    .select(FULL_HIRE_COLUMNS)
    .single();

  if (error || !data) {
    throw new AppError('Failed to update onboarding hire record.', 'DB_WRITE_FAILED', 500);
  }

  return data;
}
