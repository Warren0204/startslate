/**
 * @file src/repositories/audit.repo.js
 * @description Append-only data access layer for `public.system_audit_logs` (`log_` prefix) with automatic PII metadata scrubbing.
 */

import { AppError } from '../lib/errors.js';

const SENSITIVE_METADATA_KEYS = new Set([
  'hire_base_salary_amount',
  'base_salary_amount',
  'salary',
  'hire_gov_id_number_enc',
  'id_number',
  'gov_id_number',
  'hire_gov_id_image_path',
  'hire_extracted_pii_json',
  'password',
  'token',
  'raw_token',
  'secret',
  'webhook_secret',
  'address',
]);

const AUDIT_COLUMNS = [
  'log_id',
  'log_org_id',
  'log_actor_usr_id',
  'log_actor_role',
  'log_action',
  'log_entity_type',
  'log_entity_id',
  'log_ip_hash',
  'log_metadata_json',
  'log_created_at',
].join(', ');

/**
 * Recursively strips sensitive PII and secret keys from audit metadata objects before persistence.
 *
 * @description Ensures RA 10173 data minimization on immutable `system_audit_logs` entries.
 * @param {unknown} value - Arbitrary metadata object or primitive.
 * @param {number} [depth=0] - Recursion depth guard.
 * @returns {unknown} Scrubbed metadata value safe for immutable audit storage.
 * @throws {Error} Never throws.
 */
export function scrubAuditMetadata(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) {
    return value ?? null;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => scrubAuditMetadata(item, depth + 1));
  }
  if (typeof value === 'object') {
    const clean = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_METADATA_KEYS.has(k.toLowerCase())) {
        continue;
      }
      clean[k] = scrubAuditMetadata(v, depth + 1);
    }
    return clean;
  }
  return value;
}

/**
 * Appends an immutable audit entry to `public.system_audit_logs`.
 *
 * @description Scrubs sensitive keys from `log_metadata_json` and performs an append-only `INSERT`.
 * @param {import('@supabase/supabase-js').SupabaseClient} adminDb - Service-role Supabase client.
 * @param {{
 *   orgId: string,
 *   actorUsrId?: string|null,
 *   actorRole: 'org_admin'|'hr_admin'|'it_admin'|'department_manager'|'candidate_portal'|'system',
 *   action: string,
 *   entityType: 'organization'|'user_profile'|'onboarding_hire'|'it_provisioning_task',
 *   entityId: string,
 *   ipHash?: string|null,
 *   metadata?: object
 * }} entry - Audit event payload.
 * @returns {Promise<object>} Inserted `system_audit_logs` row.
 * @throws {AppError} AUDIT_WRITE_FAILED (500) if the audit insert fails.
 */
export async function recordAuditEvent(adminDb, entry) {
  const safeMetadata = scrubAuditMetadata(entry.metadata ?? {});

  const { data, error } = await adminDb
    .from('system_audit_logs')
    .insert({
      log_org_id: entry.orgId,
      log_actor_usr_id: entry.actorUsrId ?? null,
      log_actor_role: entry.actorRole,
      log_action: entry.action,
      log_entity_type: entry.entityType,
      log_entity_id: entry.entityId,
      log_ip_hash: entry.ipHash ?? null,
      log_metadata_json: safeMetadata,
    })
    .select(AUDIT_COLUMNS)
    .single();

  if (error || !data) {
    throw new AppError('Failed to write immutable audit log entry.', 'AUDIT_WRITE_FAILED', 500);
  }

  return data;
}

/**
 * Lists recent immutable audit logs for the caller's organization.
 *
 * @description Queries `system_audit_logs` via the caller's RLS-bound session client.
 * @param {import('@supabase/supabase-js').SupabaseClient} db - User-session Supabase client.
 * @param {object} actor - Authenticated `user_profiles` row.
 * @param {{ limit?: number }} [options={}] - Pagination options.
 * @returns {Promise<Array<object>>} Ordered audit log rows (newest first).
 * @throws {AppError} DB_QUERY_FAILED (500) on query errors.
 */
export async function listAuditLogs(db, actor, options = {}) {
  const { data, error } = await db
    .from('system_audit_logs')
    .select(AUDIT_COLUMNS)
    .eq('log_org_id', actor.usr_org_id)
    .order('log_created_at', { ascending: false })
    .limit(Math.min(options.limit ?? 50, 200));

  if (error) {
    throw new AppError('Failed to fetch system audit logs.', 'DB_QUERY_FAILED', 500);
  }

  return data ?? [];
}
