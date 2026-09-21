import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

let _adminClient: SupabaseClient | null = null;

/**
 * Server-only Supabase client with service role key.
 * MUST only be used in Server Components, API routes, or Server Actions.
 * Never import this in a client component ('use client') atau di
 * lib/services/frame.service.ts yang dipakai dari browser.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error(
      'createSupabaseAdminClient must not be called in the browser. Gunakan authenticated client + RLS.'
    );
  }
  if (!_adminClient) {
    if (!supabaseServiceRole) {
      throw new Error(
        'SUPABASE_SERVICE_ROLE_KEY is not set. Required for admin operations.'
      );
    }
    _adminClient = createClient(supabaseUrl, supabaseServiceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _adminClient;
}
