/**
 * @file src/services/settings.service.js
 * @description Workspace settings service for team role management, HTTPS IT webhook configuration, and billing overview.
 */

import { ConflictError, ExternalServiceError, NotFoundError, ValidationError } from '../lib/errors.js';
import { encryptPII, generateOpaqueToken } from '../lib/security/crypto.js';
import { assertCorporateEmail } from '../lib/security/domainGuard.js';
import { AuthorizationError, PERMISSIONS, ROLES, authorizeAction } from '../lib/security/rbac.js';
import { recordAuditEvent } from '../repositories/audit.repo.js';
import { getOrganizationById, updateOrganizationConfig } from '../repositories/organizations.repo.js';
import { createUserProfile, listOrgUserProfiles, updateUserProfile } from '../repositories/users.repo.js';
import { assertSafeWebhookUrl } from './provisioning.service.js';

/**
 * Loads sanitized organization settings and team member directory for `/settings`.
 *
 * @description Never exposes encrypted webhook secrets; returns a boolean `has_webhook_secret` indicator instead.
 * @param {{ db: import('@supabase/supabase-js').SupabaseClient, adminDb: import('@supabase/supabase-js').SupabaseClient, actor: object }} params - Query context.
 * @returns {Promise<{ organization: object, members: Array<object> }>} Sanitized workspace settings payload.
 * @throws {NotFoundError} ORG_NOT_FOUND (404) when the tenant cannot be located.
 */
export async function getWorkspaceSettings({ db, adminDb, actor }) {
  const org = await getOrganizationById(adminDb, actor.usr_org_id);
  if (!org) {
    throw new NotFoundError('Organization workspace not found.', 'ORG_NOT_FOUND');
  }

  const members = await listOrgUserProfiles(db, actor);

  return {
    organization: {
      org_id: org.org_id,
      org_name: org.org_name,
      org_domain: org.org_domain,
      org_subscription_tier: org.org_subscription_tier,
      org_monthly_hires_used: org.org_monthly_hires_used,
      org_monthly_hires_limit: org.org_monthly_hires_limit,
      org_quota_reset_at: org.org_quota_reset_at,
      org_it_webhook_url: org.org_it_webhook_url,
      has_webhook_secret: Boolean(org.org_it_webhook_secret_enc),
      org_dpo_email: org.org_dpo_email,
      org_retention_days: org.org_retention_days,
    },
    members,
  };
}

/**
 * Updates the organization's HTTPS IT provisioning webhook URL and optionally rotates its HMAC-SHA256 signing secret.
 *
 * @description Enforces `WEBHOOK_MANAGE` RBAC (`org_admin` or `it_admin`), SSRF-validates the HTTPS endpoint,
 * encrypts any newly rotated secret via AES-256-GCM bound to `${orgId}:webhook`, and logs `WEBHOOK_CONFIG_UPDATED`.
 * @param {{
 *   adminDb: import('@supabase/supabase-js').SupabaseClient,
 *   actor: object,
 *   ipHash: string,
 *   input: { webhook_url?: string|null, rotate_secret?: boolean }
 * }} params - Update parameters.
 * @returns {Promise<{ org_it_webhook_url: string|null, has_webhook_secret: boolean, new_signing_secret: string|null }>} Saved webhook config (secret shown once on rotation).
 * @throws {AuthorizationError} When caller lacks `WEBHOOK_MANAGE`.
 * @throws {ValidationError} When the webhook URL fails HTTPS / SSRF validation.
 */
export async function updateWebhookSettings({ adminDb, actor, ipHash, input }) {
  authorizeAction(actor, PERMISSIONS.WEBHOOK_MANAGE);

  const patch = {};
  if (input.webhook_url !== undefined) {
    if (input.webhook_url === null || input.webhook_url.trim() === '') {
      patch.org_it_webhook_url = null;
    } else {
      const safeUrl = assertSafeWebhookUrl(input.webhook_url.trim());
      patch.org_it_webhook_url = safeUrl.toString();
    }
  }

  let newSigningSecret = null;
  if (input.rotate_secret) {
    newSigningSecret = `whsec_${generateOpaqueToken(24)}`;
    patch.org_it_webhook_secret_enc = encryptPII(newSigningSecret, `${actor.usr_org_id}:webhook`);
  }

  const updated = await updateOrganizationConfig(adminDb, actor.usr_org_id, patch);

  await recordAuditEvent(adminDb, {
    orgId: actor.usr_org_id,
    actorUsrId: actor.usr_id,
    actorRole: actor.usr_role,
    action: 'WEBHOOK_CONFIG_UPDATED',
    entityType: 'organization',
    entityId: actor.usr_org_id,
    ipHash,
    metadata: {
      webhook_configured: Boolean(updated.org_it_webhook_url),
      secret_rotated: Boolean(newSigningSecret),
    },
  });

  return {
    org_it_webhook_url: updated.org_it_webhook_url,
    has_webhook_secret: Boolean(updated.org_it_webhook_secret_enc),
    new_signing_secret: newSigningSecret,
  };
}

/**
 * Invites a corporate team member into the organization and assigns an RBAC role.
 *
 * @description Enforces `USERS_MANAGE`, prevents `hr_admin` from creating `org_admin` accounts, verifies the
 * invited email matches the organization's corporate domain, invites via Supabase Auth, and inserts `user_profiles`.
 * @param {{
 *   adminDb: import('@supabase/supabase-js').SupabaseClient,
 *   actor: object,
 *   ipHash: string,
 *   input: { email: string, full_name: string, role: string, department_name?: string|null }
 * }} params - Invite parameters.
 * @returns {Promise<{ member: object }>} Created team member profile.
 * @throws {AuthorizationError} When caller lacks `USERS_MANAGE` or attempts privilege escalation.
 * @throws {ValidationError} When the invited email does not match the corporate domain or manager lacks a department.
 */
export async function inviteTeamMember({ adminDb, actor, ipHash, input }) {
  authorizeAction(actor, PERMISSIONS.USERS_MANAGE);

  if (actor.usr_role === ROLES.HR_ADMIN && input.role === ROLES.ORG_ADMIN) {
    throw new AuthorizationError('Only an org_admin can assign the org_admin role.', 'FORBIDDEN', 403);
  }

  if (input.role === ROLES.DEPARTMENT_MANAGER && !input.department_name?.trim()) {
    throw new ValidationError('Department name is required when assigning the department_manager role.');
  }

  const { email, domain } = assertCorporateEmail(input.email);
  const org = await getOrganizationById(adminDb, actor.usr_org_id);
  if (!org) {
    throw new NotFoundError('Organization workspace not found.', 'ORG_NOT_FOUND');
  }

  if (domain !== org.org_domain) {
    throw new ValidationError(
      `Team members must use an @${org.org_domain} corporate email address.`
    );
  }

  const { data: inviteData, error: inviteError } = await adminDb.auth.admin.inviteUserByEmail(email, {
    data: { full_name: input.full_name, org_id: org.org_id, role: input.role },
  });

  if (inviteError || !inviteData?.user) {
    if (inviteError?.message?.toLowerCase().includes('already')) {
      throw new ConflictError('A user with this email already belongs to a workspace.', 'EMAIL_ALREADY_REGISTERED');
    }
    throw new ExternalServiceError('Unable to send team invitation email.', 'AUTH_INVITE_FAILED');
  }

  const member = await createUserProfile(adminDb, {
    usr_id: inviteData.user.id,
    usr_org_id: org.org_id,
    usr_email: email,
    usr_full_name: input.full_name,
    usr_role: input.role,
    usr_department_name: input.role === ROLES.DEPARTMENT_MANAGER ? input.department_name.trim() : null,
    usr_status: 'invited',
  });

  await recordAuditEvent(adminDb, {
    orgId: org.org_id,
    actorUsrId: actor.usr_id,
    actorRole: actor.usr_role,
    action: 'TEAM_MEMBER_INVITED',
    entityType: 'user_profile',
    entityId: member.usr_id,
    ipHash,
    metadata: { assigned_role: member.usr_role },
  });

  return { member };
}

/**
 * Updates an existing team member's role or status inside the organization.
 *
 * @description Enforces `USERS_MANAGE` and blocks privilege escalation by `hr_admin`.
 * @param {{
 *   adminDb: import('@supabase/supabase-js').SupabaseClient,
 *   actor: object,
 *   ipHash: string,
 *   input: { usr_id: string, usr_role: string, usr_department_name?: string|null }
 * }} params - Update inputs.
 * @returns {Promise<{ member: object }>} Updated team member profile.
 * @throws {AuthorizationError} When unauthorized or attempting `org_admin` escalation.
 */
export async function updateTeamMemberRole({ adminDb, actor, ipHash, input }) {
  authorizeAction(actor, PERMISSIONS.USERS_MANAGE);

  if (actor.usr_role === ROLES.HR_ADMIN && input.usr_role === ROLES.ORG_ADMIN) {
    throw new AuthorizationError('Only an org_admin can promote a member to org_admin.', 'FORBIDDEN', 403);
  }
  if (input.usr_role === ROLES.DEPARTMENT_MANAGER && !input.usr_department_name?.trim()) {
    throw new ValidationError('Department name is required for department_manager.');
  }

  const member = await updateUserProfile(adminDb, actor.usr_org_id, input.usr_id, {
    usr_role: input.usr_role,
    usr_department_name:
      input.usr_role === ROLES.DEPARTMENT_MANAGER ? input.usr_department_name.trim() : null,
  });

  await recordAuditEvent(adminDb, {
    orgId: actor.usr_org_id,
    actorUsrId: actor.usr_id,
    actorRole: actor.usr_role,
    action: 'TEAM_MEMBER_ROLE_UPDATED',
    entityType: 'user_profile',
    entityId: member.usr_id,
    ipHash,
    metadata: { new_role: member.usr_role },
  });

  return { member };
}
