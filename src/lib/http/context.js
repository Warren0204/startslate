/**
 * @file src/lib/http/context.js
 * @description Builds the per-request service context: authenticated actor profile, Supabase clients, and hashed IP.
 */

import { createSupabaseServerClient } from '../supabase/server.js';
import { getSupabaseAdminClient } from '../supabase/admin.js';
import { hashIpAddress } from '../security/crypto.js';
import { AuthorizationError } from '../security/rbac.js';
import { getActiveProfileById } from '../../repositories/users.repo.js';
import { getClientIp } from './request.js';

/**
 * Resolves the service context for an API request.
 *
 * @description Creates the service-role client, hashes the client IP for audit logs, and — when an actor is
 * required — validates the Supabase session and loads the caller's active `user_profiles` row.
 * @param {Request} request - Incoming request.
 * @param {{ requireActor?: boolean, withSessionClient?: boolean }} [options={}] - Context options.
 * @returns {Promise<{ actor: object|null, db: object|null, adminDb: object, ipHash: string }>} Service context.
 * @throws {AuthorizationError} UNAUTHENTICATED (401) without a valid session, ACCOUNT_DISABLED (403) without an active profile.
 * @throws {import('../errors.js').AppError} SUPABASE_NOT_CONFIGURED (500) when credentials are missing.
 */
export async function getRequestContext(request, { requireActor = true, withSessionClient = false } = {}) {
  const adminDb = getSupabaseAdminClient();
  const ipHash = hashIpAddress(getClientIp(request));
  const db = requireActor || withSessionClient ? await createSupabaseServerClient() : null;

  if (!requireActor) {
    return { actor: null, db, adminDb, ipHash };
  }

  const { data, error } = await db.auth.getUser();
  if (error || !data?.user) {
    throw new AuthorizationError('Authentication required.', 'UNAUTHENTICATED', 401);
  }

  const actor = await getActiveProfileById(db, data.user.id);
  if (!actor) {
    throw new AuthorizationError(
      'No active StartSlate workspace profile was found for this account.',
      'ACCOUNT_DISABLED',
      403
    );
  }

  return { actor, db, adminDb, ipHash };
}
