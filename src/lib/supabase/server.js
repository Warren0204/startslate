/**
 * @file src/lib/supabase/server.js
 * @description Cookie-bound Supabase client (anon key) for Route Handlers and Server Components, subject to RLS.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { AppError } from '../errors.js';

/**
 * Creates a request-scoped Supabase client bound to the caller's auth cookies.
 *
 * @description Uses `@supabase/ssr` with Next.js `cookies()` so every query runs as the signed-in user under RLS.
 * @param {void} _unused - No arguments.
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>} User-session Supabase client.
 * @throws {AppError} SUPABASE_NOT_CONFIGURED (500) when public Supabase env vars are missing.
 */
export async function createSupabaseServerClient(_unused) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new AppError('Supabase public credentials are not configured.', 'SUPABASE_NOT_CONFIGURED', 500);
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      /**
       * Returns all request cookies.
       *
       * @description Cookie reader used by @supabase/ssr.
       * @returns {Array<{ name: string, value: string }>} Request cookies.
       * @throws {Error} Never throws.
       */
      getAll() {
        return cookieStore.getAll();
      },
      /**
       * Persists refreshed auth cookies.
       *
       * @description Cookie writer used by @supabase/ssr; ignored when called from a Server Component.
       * @param {Array<{ name: string, value: string, options: object }>} cookiesToSet - Cookies to write.
       * @returns {void} Nothing.
       * @throws {Error} Never throws; read-only contexts are silently ignored.
       */
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot set cookies; session refresh happens in Route Handlers.
        }
      },
    },
  });
}
