/**
 * @file src/services/provisioning.service.js
 * @description Department-to-IT provisioning checklist generator, SSRF-safe HMAC-SHA256 webhook dispatcher, and Day-1 readiness evaluator.
 */

import crypto from 'node:crypto';

import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import { decryptPII, signWebhookPayload } from '../lib/security/crypto.js';
import { PERMISSIONS, authorizeAction } from '../lib/security/rbac.js';
import { recordAuditEvent } from '../repositories/audit.repo.js';
import { getHireByIdAdmin, updateHire } from '../repositories/hires.repo.js';
import { getOrganizationById } from '../repositories/organizations.repo.js';
import {
  countIncompleteTasks,
  createProvisioningTasksIdempotent,
  getTaskById,
  markTaskCompleted,
  updateWebhookStatusForHire,
} from '../repositories/tasks.repo.js';

const WEBHOOK_TIMEOUT_MS = 8000;

/**
 * Default department-to-IT provisioning checklist templates used when an org has not customized rules.
 *
 * @type {Readonly<Record<string, ReadonlyArray<{ task_title: string, task_category: 'hardware'|'iam'|'saas'|'security' }>>>}
 */
export const DEFAULT_DEPARTMENT_IT_RULES = Object.freeze({
  _default: Object.freeze([
    { task_title: 'Provision Corporate Email & SSO Identity', task_category: 'iam' },
    { task_title: 'Issue Laptop, Charger & Endpoint MDM Enrollment', task_category: 'hardware' },
    { task_title: 'Configure MFA, Password Manager & VPN Access', task_category: 'security' },
  ]),
  engineering: Object.freeze([
    { task_title: 'Provision Corporate Email & SSO Identity', task_category: 'iam' },
    { task_title: 'Issue Developer Workstation & Endpoint MDM Enrollment', task_category: 'hardware' },
    { task_title: 'Grant GitHub Organization, CI/CD & Cloud Staging Access', task_category: 'saas' },
    { task_title: 'Configure Hardware MFA, SSH Keys & Zero-Trust VPN', task_category: 'security' },
  ]),
  sales: Object.freeze([
    { task_title: 'Provision Corporate Email & SSO Identity', task_category: 'iam' },
    { task_title: 'Issue Sales Laptop & Headset Kit', task_category: 'hardware' },
    { task_title: 'Provision CRM Seat & Calendar Scheduling License', task_category: 'saas' },
    { task_title: 'Configure MFA & DLP Endpoint Policy', task_category: 'security' },
  ]),
  finance: Object.freeze([
    { task_title: 'Provision Corporate Email & SSO Identity', task_category: 'iam' },
    { task_title: 'Issue Encrypted Finance Workstation', task_category: 'hardware' },
    { task_title: 'Grant ERP / Accounting Role-Scoped Access', task_category: 'saas' },
    { task_title: 'Configure Hardware MFA & Privileged Audit Monitoring', task_category: 'security' },
  ]),
  hr: Object.freeze([
    { task_title: 'Provision Corporate Email & SSO Identity', task_category: 'iam' },
    { task_title: 'Issue Laptop & Privacy Screen Filter', task_category: 'hardware' },
    { task_title: 'Grant HRIS & Payroll Portal Access', task_category: 'saas' },
    { task_title: 'Configure MFA & RA 10173 Data-Handler Security Profile', task_category: 'security' },
  ]),
});

/**
 * Resolves the IT provisioning task checklist for a hire's department.
 *
 * @description Looks up case-insensitive `hire_department_name` in `org_it_rules_json`, falling back to
 * `DEFAULT_DEPARTMENT_IT_RULES[dept]` and then `_default`.
 * @param {string} departmentName - Hire's `hire_department_name`.
 * @param {object} [orgRulesJson={}] - Organization-specific JSONB task rule overrides.
 * @returns {Array<{ task_title: string, task_category: string }>} Resolved checklist templates.
 * @throws {Error} Never throws.
 */
export function resolveDepartmentTasks(departmentName, orgRulesJson = {}) {
  const normalizedDept = String(departmentName || '').trim().toLowerCase();

  if (orgRulesJson && typeof orgRulesJson === 'object') {
    for (const [key, list] of Object.entries(orgRulesJson)) {
      if (key.trim().toLowerCase() === normalizedDept && Array.isArray(list) && list.length > 0) {
        return list
          .filter((item) => item && typeof item.task_title === 'string' && item.task_title.trim())
          .map((item) => ({
            task_title: item.task_title.trim(),
            task_category: ['hardware', 'iam', 'saas', 'security'].includes(item.task_category)
              ? item.task_category
              : 'iam',
          }));
      }
    }
  }

  return [...(DEFAULT_DEPARTMENT_IT_RULES[normalizedDept] ?? DEFAULT_DEPARTMENT_IT_RULES._default)];
}

/**
 * Validates that an outbound webhook URL is safe against SSRF (strict HTTPS, public host only).
 *
 * @description Rejects non-HTTPS URLs, localhost, loopback, link-local, and RFC1918 private IP ranges.
 * @param {string} urlString - Configured `org_it_webhook_url`.
 * @returns {URL} Verified HTTPS URL object.
 * @throws {ValidationError} When URL scheme or host violates SSRF policy.
 */
export function assertSafeWebhookUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new ValidationError('Configured IT webhook URL is not a valid URL.');
  }

  if (parsed.protocol !== 'https:') {
    throw new ValidationError('IT webhook URL must use HTTPS.');
  }

  const host = parsed.hostname.toLowerCase();
  const isBlockedHost =
    host === 'localhost' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

  if (isBlockedHost) {
    throw new ValidationError('IT webhook URL cannot target localhost or private network addresses.');
  }

  return parsed;
}

/**
 * Dispatches an HMAC-SHA256 signed (`X-StartSlate-Signature`) zero-PII IT provisioning webhook.
 *
 * @description Signs `${unixTs}.${rawBody}` using the org's decrypted webhook secret and posts operational
 * onboarding metadata only (never salary, personal email, or Government ID fields).
 * @param {{ org: object, hire: object, tasks: Array<object>, fetchImpl?: typeof fetch }} params - Dispatch inputs.
 * @returns {Promise<'not_configured'|'delivered'|'failed'>} Final delivery telemetry status.
 * @throws {Error} Never throws on remote webhook errors; returns `'failed'` so provisioning is not blocked.
 */
export async function dispatchProvisioningWebhook({ org, hire, tasks, fetchImpl = fetch }) {
  if (!org?.org_it_webhook_url || !org?.org_it_webhook_secret_enc) {
    return 'not_configured';
  }

  let webhookUrl;
  let secret;
  try {
    webhookUrl = assertSafeWebhookUrl(org.org_it_webhook_url);
    secret = decryptPII(org.org_it_webhook_secret_enc, `${org.org_id}:webhook`);
  } catch {
    return 'failed';
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const deliveryId = crypto.randomUUID();

  // Strictly zero-PII operational payload
  const payload = {
    event: 'hire.provisioning.requested',
    delivery_id: deliveryId,
    timestamp,
    org_id: org.org_id,
    hire: {
      hire_id: hire.hire_id,
      hire_full_name: hire.hire_full_name,
      hire_work_email: hire.hire_work_email ?? null,
      hire_job_title: hire.hire_job_title,
      hire_department_name: hire.hire_department_name,
      hire_start_date: hire.hire_start_date,
      hire_employment_type: hire.hire_employment_type,
    },
    tasks: tasks.map((t) => ({
      task_id: t.task_id,
      task_title: t.task_title,
      task_category: t.task_category,
      task_status: t.task_status,
    })),
  };

  const rawBody = JSON.stringify(payload);
  const signature = signWebhookPayload(secret, timestamp, rawBody);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetchImpl(webhookUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-StartSlate-Event': 'hire.provisioning.requested',
        'X-StartSlate-Delivery-Id': deliveryId,
        'X-StartSlate-Signature': signature,
      },
      body: rawBody,
      signal: controller.signal,
    });
    return response.ok ? 'delivered' : 'failed';
  } catch {
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generates department IT provisioning tasks, transitions a verified hire to `it_provisioning`, and fires the signed webhook.
 *
 * @description Requires the hire to be in `docs_verified` status with HITL review cleared.
 * @param {{
 *   adminDb: import('@supabase/supabase-js').SupabaseClient,
 *   actorUsrId?: string|null,
 *   actorRole: 'org_admin'|'hr_admin'|'it_admin'|'candidate_portal'|'system',
 *   ipHash: string,
 *   hire: object,
 *   fetchImpl?: typeof fetch
 * }} params - Provisioning orchestration parameters.
 * @returns {Promise<{ hire: object, tasks: Array<object>, webhook_status: string }>} Provisioning result.
 * @throws {ConflictError} INVALID_STATE_TRANSITION (409) when the hire is not in `docs_verified` status.
 * @throws {NotFoundError} ORG_NOT_FOUND (404) when the organization cannot be resolved.
 */
export async function provisionHireIT({ adminDb, actorUsrId = null, actorRole, ipHash, hire, fetchImpl }) {
  if (hire.hire_status !== 'docs_verified' || hire.hire_needs_hitl_review) {
    throw new ConflictError(
      'IT provisioning can only start once candidate documents are verified and HITL review is cleared.',
      'INVALID_STATE_TRANSITION'
    );
  }

  const org = await getOrganizationById(adminDb, hire.hire_org_id);
  if (!org) {
    throw new NotFoundError('Organization workspace not found.', 'ORG_NOT_FOUND');
  }

  const taskTemplates = resolveDepartmentTasks(hire.hire_department_name, org.org_it_rules_json);
  const initialWebhookStatus = org.org_it_webhook_url ? 'pending' : 'not_configured';

  const tasks = await createProvisioningTasksIdempotent(
    adminDb,
    hire.hire_org_id,
    hire.hire_id,
    taskTemplates.map((t) => ({ ...t, task_webhook_status: initialWebhookStatus }))
  );

  const updatedHire = await updateHire(adminDb, hire.hire_org_id, hire.hire_id, {
    hire_status: 'it_provisioning',
  });

  const webhookStatus = await dispatchProvisioningWebhook({
    org,
    hire: updatedHire,
    tasks,
    fetchImpl,
  });

  if (webhookStatus !== 'not_configured') {
    await updateWebhookStatusForHire(adminDb, hire.hire_org_id, hire.hire_id, webhookStatus);
  }

  await recordAuditEvent(adminDb, {
    orgId: hire.hire_org_id,
    actorUsrId,
    actorRole,
    action: 'IT_PROVISIONING_STARTED',
    entityType: 'onboarding_hire',
    entityId: hire.hire_id,
    ipHash,
    metadata: {
      hire_department_name: hire.hire_department_name,
      task_count: tasks.length,
      webhook_status: webhookStatus,
    },
  });

  return {
    hire: updatedHire,
    tasks,
    webhook_status: webhookStatus,
  };
}

/**
 * Marks an IT provisioning task as completed and auto-transitions the hire to `day1_ready` when all tasks finish.
 *
 * @description Enforces `TASK_UPDATE` RBAC (`org_admin` or `it_admin`), updates the task, counts remaining
 * incomplete tasks, and advances `onboarding_hires.hire_status` from `it_provisioning` to `day1_ready`.
 * @param {{
 *   db: import('@supabase/supabase-js').SupabaseClient,
 *   adminDb: import('@supabase/supabase-js').SupabaseClient,
 *   actor: object,
 *   ipHash: string,
 *   taskId: string,
 *   notes?: string
 * }} params - Completion parameters.
 * @returns {Promise<{ task: object, hire_status: string, remaining_tasks: number }>} Updated task and hire readiness state.
 * @throws {import('../lib/security/rbac.js').AuthorizationError} When caller lacks `TASK_UPDATE` permission.
 * @throws {NotFoundError} TASK_NOT_FOUND (404) when the task does not exist in the caller's org.
 */
export async function completeProvisioningTask({ db, adminDb, actor, ipHash, taskId, notes }) {
  authorizeAction(actor, PERMISSIONS.TASK_UPDATE);

  const existingTask = await getTaskById(db, actor, taskId);
  if (!existingTask) {
    throw new NotFoundError('IT provisioning task not found.', 'TASK_NOT_FOUND');
  }

  const completedTask =
    existingTask.task_status === 'completed'
      ? existingTask
      : await markTaskCompleted(adminDb, actor.usr_org_id, taskId, actor.usr_id, notes);

  await recordAuditEvent(adminDb, {
    orgId: actor.usr_org_id,
    actorUsrId: actor.usr_id,
    actorRole: actor.usr_role,
    action: 'IT_TASK_COMPLETED',
    entityType: 'it_provisioning_task',
    entityId: completedTask.task_id,
    ipHash,
    metadata: {
      task_hire_id: completedTask.task_hire_id,
      task_category: completedTask.task_category,
    },
  });

  const remainingTasks = await countIncompleteTasks(adminDb, actor.usr_org_id, completedTask.task_hire_id);
  const hire = await getHireByIdAdmin(adminDb, actor.usr_org_id, completedTask.task_hire_id);

  let currentHireStatus = hire?.hire_status ?? 'it_provisioning';
  if (remainingTasks === 0 && hire && hire.hire_status === 'it_provisioning') {
    const readyHire = await updateHire(adminDb, actor.usr_org_id, hire.hire_id, {
      hire_status: 'day1_ready',
    });
    currentHireStatus = readyHire.hire_status;

    await recordAuditEvent(adminDb, {
      orgId: actor.usr_org_id,
      actorUsrId: actor.usr_id,
      actorRole: actor.usr_role,
      action: 'HIRE_DAY1_READY',
      entityType: 'onboarding_hire',
      entityId: hire.hire_id,
      ipHash,
      metadata: { completed_by_role: actor.usr_role },
    });
  }

  return {
    task: completedTask,
    hire_status: currentHireStatus,
    remaining_tasks: remainingTasks,
  };
}
