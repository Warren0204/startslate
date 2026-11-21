/**
 * @file src/services/auth.service.js
 * @description Corporate workspace registration service enforcing StartSlate's corporate-domain gate.
 */

import { ConflictError, ExternalServiceError } from '../lib/errors.js';
import { assertCorporateEmail } from '../lib/security/domainGuard.js';
import { ROLES } from '../lib/security/rbac.js';
import { recordAuditEvent } from '../repositories/audit.repo.js';
import { createOrganization, findOrganizationByDomain } from '../repositories/organizations.repo.js';
import { createUserProfile } from '../repositories/users.repo.js';

/**
 * Registers a new corporate StartSlate workspace and its founding `org_admin` user.
 *
 * @description Blocks public consumer webmail via `domainGuard`, verifies domain uniqueness, provisions the
 * Supabase Auth account, creates `organizations` and `user_profiles` rows, and records `ORG_CREATED`.
 * Rolls back the Auth user if workspace persistence fails.
 * @param {{
 *   adminDb: import('@supabase/supabase-js').SupabaseClient,
 *   ipHash: string,
 *   input: { email: string, password: string, full_name: string, org_name: string }
 * }} params - Registration parameters.
 * @returns {Promise<{ organization: object, user_profile: object }>} Created workspace and admin profile.
 * @throws {import('../lib/security/domainGuard.js').DomainGuardError} When email is malformed or public webmail.
 * @throws {ConflictError} DOMAIN_ALREADY_REGISTERED (409) or EMAIL_ALREADY_REGISTERED (409).
 * @throws {ExternalServiceError} AUTH_SIGNUP_FAILED (502) if Supabase Auth fails.
 */
export async function signupCorporateWorkspace({ adminDb, ipHash, input }) {
  const { email, domain } = assertCorporateEmail(input.email);

  const existingOrg = await findOrganizationByDomain(adminDb, domain);
  if (existingOrg) {
    throw new ConflictError(
      'A StartSlate workspace already exists for this corporate domain. Contact your org admin for an invite.',
      'DOMAIN_ALREADY_REGISTERED'
    );
  }

  const { data: authData, error: authError } = await adminDb.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: false,
    user_metadata: {
      full_name: input.full_name,
      org_name: input.org_name,
    },
  });

  if (authError || !authData?.user) {
    if (authError?.message?.toLowerCase().includes('already')) {
      throw new ConflictError('An account with this email already exists.', 'EMAIL_ALREADY_REGISTERED');
    }
    throw new ExternalServiceError('Unable to create authentication account.', 'AUTH_SIGNUP_FAILED');
  }

  const authUserId = authData.user.id;
  try {
    const organization = await createOrganization(adminDb, {
      org_name: input.org_name,
      org_domain: domain,
      org_dpo_email: email,
    });

    const userProfile = await createUserProfile(adminDb, {
      usr_id: authUserId,
      usr_org_id: organization.org_id,
      usr_email: email,
      usr_full_name: input.full_name,
      usr_role: ROLES.ORG_ADMIN,
      usr_status: 'active',
    });

    await recordAuditEvent(adminDb, {
      orgId: organization.org_id,
      actorUsrId: userProfile.usr_id,
      actorRole: ROLES.ORG_ADMIN,
      action: 'ORG_CREATED',
      entityType: 'organization',
      entityId: organization.org_id,
      ipHash,
      metadata: {
        org_domain: organization.org_domain,
        org_subscription_tier: organization.org_subscription_tier,
      },
    });

    return {
      organization: {
        org_id: organization.org_id,
        org_name: organization.org_name,
        org_domain: organization.org_domain,
        org_subscription_tier: organization.org_subscription_tier,
        org_monthly_hires_used: organization.org_monthly_hires_used,
        org_monthly_hires_limit: organization.org_monthly_hires_limit,
      },
      user_profile: userProfile,
    };
  } catch (error) {
    // Compensate: remove orphaned Supabase Auth user if org/profile creation failed
    try {
      await adminDb.auth.admin.deleteUser(authUserId);
    } catch {
      console.error('[StartSlate] Auth rollback failed for user', authUserId);
    }
    throw error;
  }
}
