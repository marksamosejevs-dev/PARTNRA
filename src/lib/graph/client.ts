import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * The Partnership Graph's persistence layer. Server-only -- every caller
 * is a Next.js Route Handler or a Netlify Function, never client code; the
 * service-role key bypasses row-level security and must never reach the
 * browser. Deep Discovery is entirely optional infrastructure on top of
 * Quick Scan: when these env vars aren't set (e.g. a fresh checkout before
 * the user has provisioned a Supabase project), isGraphConfigured() is the
 * single honest gate every Deep Discovery entry point checks -- Quick Scan
 * itself never depends on this module at all.
 */
export function isGraphConfigured(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

let cached: SupabaseClient | null = null;

export function getGraphClient(): SupabaseClient {
  if (!isGraphConfigured()) {
    throw new Error("Partnership Graph is not configured -- SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are missing.");
  }
  if (!cached) {
    cached = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
      auth: { persistSession: false },
    });
  }
  return cached;
}
