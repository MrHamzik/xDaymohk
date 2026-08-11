import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client for API routes and Server Actions.
 *
 * IMPORTANT: this client BYPASSES Row Level Security. It must only be
 * imported from server-only files (API route handlers, Server Actions,
 * Server Components). Never import it from a Client Component — that
 * would leak SUPABASE_SERVICE_ROLE_KEY into the browser bundle, which
 * would be a complete database takeover.
 *
 * Every callsite MUST verify the caller's identity and authorization
 * BEFORE using this client. The standard pattern in this repo is:
 *
 *   const session = await getUserFromRequest(request);
 *   if (!session?.user) return 401;
 *   if (!isAdminEmail(session.user.email)) return 403;
 *
 *   const admin = createAdminClient();
 *   await admin.from(...).insert(...);
 *
 * The auth.*.getUser(token) call (which the request handler uses to
 * authenticate the bearer JWT) does NOT require this client — that
 * call works with the regular anon client too.
 */
let cachedAdminClient: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;

  // Cached because the underlying HTTP agent setup is expensive in
  // serverless environments. The key is server-only and never exposed.
  if (!cachedAdminClient) {
    cachedAdminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
  return cachedAdminClient;
}
