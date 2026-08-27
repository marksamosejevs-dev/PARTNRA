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

/**
 * supabase-js issues plain, un-timed-out `fetch` calls by default -- unlike
 * every external search/classify provider (see discovery/timeout.ts), a
 * stalled network call to Supabase itself had NO bound at all, and could
 * hang a discovery_jobs worker job indefinitely (see the stale-job-recovery
 * migration's comment for the production incident this caused). Wrapping
 * every Supabase call in a hard timeout turns that hang into an ordinary
 * thrown error the worker's existing failJob/retry path already handles.
 */
const SUPABASE_FETCH_TIMEOUT_MS = 20_000;

function timeoutFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(SUPABASE_FETCH_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return fetch(input, { ...init, signal });
}

let cached: SupabaseClient | null = null;

export function getGraphClient(): SupabaseClient {
  if (!isGraphConfigured()) {
    throw new Error("Partnership Graph is not configured -- SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are missing.");
  }
  if (!cached) {
    cached = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
      auth: { persistSession: false },
      global: { fetch: timeoutFetch },
    });
  }
  return cached;
}
