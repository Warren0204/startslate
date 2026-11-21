/**
 * @file src/lib/supabase/admin.js
 * @description Server-only Supabase service-role client. Bypasses RLS — callers MUST enforce RBAC and org scoping.
 */

import { createClient } from '@supabase/supabase-js';

import { AppError } from '../errors.js';

let cachedAdminClient = null;

/**
 * Returns a singleton Supabase client authenticated with the service-role key.
 *
 * @description Used for post-RBAC writes, passwordless portal flows, quota RPCs, private storage, and audit writes.
 * Never import this module from client components; `SUPABASE_SERVICE_ROLE_KEY` is not exposed to the browser.
 * @param {void} _unused - No arguments.
 * @returns {import('@supabase/supabase-js').SupabaseClient} Service-role Supabase client.
 * @throws {AppError} SERVER_ONLY (500) in a browser context, SUPABASE_NOT_CONFIGURED (500) when env vars are missing.
 */
export function getSupabaseAdminClient(_unused) {
  if (typeof window !== 'undefined') {
    throw new AppError('The service-role client is server-only.', 'SERVER_ONLY', 500);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new AppError('Supabase service credentials are not configured.', 'SUPABASE_NOT_CONFIGURED', 500);
  }

  if (!cachedAdminClient) {
    cachedAdminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return cachedAdminClient;
}
