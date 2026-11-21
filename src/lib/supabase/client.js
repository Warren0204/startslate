/**
 * @file src/lib/supabase/client.js
 * @description Browser-side Supabase Auth client created via `@supabase/ssr` for client components.
 */

import { createBrowserClient } from '@supabase/ssr';

let cachedBrowserClient = null;

/**
 * Creates or returns a singleton browser-side Supabase client bound to public anon credentials.
 *
 * @description Used exclusively inside `'use client'` auth forms and logout controls.
 * @param {void} _unused - Takes no arguments.
 * @returns {import('@supabase/supabase-js').SupabaseClient} Browser Supabase client instance.
 * @throws {Error} Throws if `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing.
 */
export function createSupabaseBrowserClient(_unused) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Supabase public environment variables are not configured.');
  }

  if (!cachedBrowserClient) {
    cachedBrowserClient = createBrowserClient(url, anonKey);
  }

  return cachedBrowserClient;
}
