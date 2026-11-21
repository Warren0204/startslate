/**
 * @file src/repositories/tasks.repo.js
 * @description Data access layer for `public.it_provisioning_tasks` (`task_` prefixed columns).
 */

import { AppError } from '../lib/errors.js';

const TASK_COLUMNS = [
  'task_id',
  'task_org_id',
  'task_hire_id',
  'task_title',
  'task_category',
  'task_status',
  'task_assigned_to_usr_id',
  'task_completed_by_usr_id',
  'task_completed_at',
  'task_notes',
  'task_webhook_status',
  'task_webhook_last_attempt_at',
  'task_created_at',
  'task_updated_at',
].join(', ');

/**
 * Idempotently inserts IT provisioning tasks for a hire without duplicating existing titles.
 *
 * @description Checks existing task titles for `(task_org_id, task_hire_id)` and inserts only missing tasks.
 * @param {import('@supabase/supabase-js').SupabaseClient} adminDb - Service-role Supabase client.
 * @param {string} orgId - Tenant organization UUID.
 * @param {string} hireId - Onboarding hire UUID.
 * @param {Array<{ task_title: string, task_category: string, task_webhook_status?: string }>} taskTemplates - Tasks to create.
 * @returns {Promise<Array<object>>} Complete list of provisioning tasks for the hire.
 * @throws {AppError} DB_WRITE_FAILED (500) on query or insert errors.
 */
export async function createProvisioningTasksIdempotent(adminDb, orgId, hireId, taskTemplates) {
  const { data: existing, error: fetchError } = await adminDb
    .from('it_provisioning_tasks')
    .select(TASK_COLUMNS)
    .eq('task_org_id', orgId)
    .eq('task_hire_id', hireId);

  if (fetchError) {
    throw new AppError('Failed to check existing IT provisioning tasks.', 'DB_QUERY_FAILED', 500);
  }

  const existingTitles = new Set((existing ?? []).map((t) => t.task_title.trim().toLowerCase()));
  const toInsert = taskTemplates
    .filter((tpl) => !existingTitles.has(tpl.task_title.trim().toLowerCase()))
    .map((tpl) => ({
      task_org_id: orgId,
      task_hire_id: hireId,
      task_title: tpl.task_title.trim(),
      task_category: tpl.task_category,
      task_status: 'pending',
      task_webhook_status: tpl.task_webhook_status ?? 'not_configured',
    }));

  if (toInsert.length === 0) {
    return existing ?? [];
  }

  const { data: inserted, error: insertError } = await adminDb
    .from('it_provisioning_tasks')
    .insert(toInsert)
    .select(TASK_COLUMNS);

  if (insertError) {
    throw new AppError('Failed to create IT provisioning tasks.', 'DB_WRITE_FAILED', 500);
  }

  return [...(existing ?? []), ...(inserted ?? [])];
}

/**
 * Fetches a single IT provisioning task scoped to the caller's organization.
 *
 * @description Uses the caller's RLS-bound session client.
 * @param {import('@supabase/supabase-js').SupabaseClient} db - User-session Supabase client.
 * @param {object} actor - Authenticated `user_profiles` row.
 * @param {string} taskId - Provisioning task UUID.
 * @returns {Promise<object|null>} Task row or `null`.
 * @throws {AppError} DB_QUERY_FAILED (500) on database failure.
 */
export async function getTaskById(db, actor, taskId) {
  const { data, error } = await db
    .from('it_provisioning_tasks')
    .select(TASK_COLUMNS)
    .eq('task_org_id', actor.usr_org_id)
    .eq('task_id', taskId)
    .maybeSingle();

  if (error) {
    throw new AppError('Failed to load IT provisioning task.', 'DB_QUERY_FAILED', 500);
  }

  return data ?? null;
}

/**
 * Lists IT provisioning tasks scoped to the caller's organization and RLS role rules.
 *
 * @description Queries `it_provisioning_tasks` via the user-session client so `department_manager` scoping applies automatically.
 * @param {import('@supabase/supabase-js').SupabaseClient} db - User-session Supabase client.
 * @param {object} actor - Authenticated `user_profiles` row.
 * @param {{ limit?: number }} [options={}] - Optional pagination options.
 * @returns {Promise<Array<object>>} Provisioning task rows ordered newest first.
 * @throws {AppError} DB_QUERY_FAILED (500) on query errors.
 */
export async function listOrgTasks(db, actor, options = {}) {
  const { data, error } = await db
    .from('it_provisioning_tasks')
    .select(TASK_COLUMNS)
    .eq('task_org_id', actor.usr_org_id)
    .order('task_created_at', { ascending: false })
    .limit(Math.min(options.limit ?? 100, 250));

  if (error) {
    throw new AppError('Failed to list IT provisioning tasks.', 'DB_QUERY_FAILED', 500);
  }

  return data ?? [];
}

/**
 * Marks a provisioning task as `completed` and records completion metadata.
 *
 * @description Tenant-scoped update executed via service-role after `TASK_UPDATE` RBAC check.
 * @param {import('@supabase/supabase-js').SupabaseClient} adminDb - Service-role Supabase client.
 * @param {string} orgId - Tenant organization UUID.
 * @param {string} taskId - Provisioning task UUID.
 * @param {string} completedByUsrId - Completing user's UUID.
 * @param {string} [notes] - Optional completion notes.
 * @returns {Promise<object>} Updated task row.
 * @throws {AppError} DB_WRITE_FAILED (500) on update failure.
 */
export async function markTaskCompleted(adminDb, orgId, taskId, completedByUsrId, notes = undefined) {
  const patch = {
    task_status: 'completed',
    task_completed_by_usr_id: completedByUsrId,
    task_completed_at: new Date().toISOString(),
  };
  if (notes !== undefined) {
    patch.task_notes = notes;
  }

  const { data, error } = await adminDb
    .from('it_provisioning_tasks')
    .update(patch)
    .eq('task_org_id', orgId)
    .eq('task_id', taskId)
    .select(TASK_COLUMNS)
    .single();

  if (error || !data) {
    throw new AppError('Failed to mark IT provisioning task as completed.', 'DB_WRITE_FAILED', 500);
  }

  return data;
}

/**
 * Counts remaining non-completed IT provisioning tasks for a hire.
 *
 * @description Used to determine whether the hire is ready to auto-transition to `day1_ready`.
 * @param {import('@supabase/supabase-js').SupabaseClient} adminDb - Service-role Supabase client.
 * @param {string} orgId - Tenant organization UUID.
 * @param {string} hireId - Onboarding hire UUID.
 * @returns {Promise<number>} Number of tasks not yet in `completed` status.
 * @throws {AppError} DB_QUERY_FAILED (500) on count error.
 */
export async function countIncompleteTasks(adminDb, orgId, hireId) {
  const { count, error } = await adminDb
    .from('it_provisioning_tasks')
    .select('task_id', { count: 'exact', head: true })
    .eq('task_org_id', orgId)
    .eq('task_hire_id', hireId)
    .neq('task_status', 'completed');

  if (error) {
    throw new AppError('Failed to count incomplete IT provisioning tasks.', 'DB_QUERY_FAILED', 500);
  }

  return count ?? 0;
}

/**
 * Updates `task_webhook_status` and `task_webhook_last_attempt_at` for all tasks belonging to a hire.
 *
 * @description Tracks webhook delivery state (`not_configured`, `pending`, `delivered`, `failed`).
 * @param {import('@supabase/supabase-js').SupabaseClient} adminDb - Service-role Supabase client.
 * @param {string} orgId - Tenant organization UUID.
 * @param {string} hireId - Onboarding hire UUID.
 * @param {'not_configured'|'pending'|'delivered'|'failed'} webhookStatus - Delivery status.
 * @returns {Promise<void>} Resolves when updated.
 * @throws {Error} Never throws; telemetry update errors are logged without failing provisioning.
 */
export async function updateWebhookStatusForHire(adminDb, orgId, hireId, webhookStatus) {
  const { error } = await adminDb
    .from('it_provisioning_tasks')
    .update({
      task_webhook_status: webhookStatus,
      task_webhook_last_attempt_at: new Date().toISOString(),
    })
    .eq('task_org_id', orgId)
    .eq('task_hire_id', hireId);

  if (error) {
    console.error('[StartSlate] Failed to update task webhook telemetry for hire', hireId);
  }
}
