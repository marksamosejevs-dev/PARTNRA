import type { Config } from "@netlify/functions";
import { runWorkerTick } from "../../src/lib/deepDiscovery/worker";
import { isGraphConfigured } from "../../src/lib/graph/client";

/**
 * Genuine background execution for Deep Discovery (Section 21) -- a
 * Netlify Scheduled Function, not a browser timer. This is what makes
 * "start a scan, leave the page, come back later" real: progress lives in
 * Postgres (see supabase/migrations/), and THIS function is what actually
 * advances it, independent of whether any browser tab is open.
 *
 * Relative imports only (never the `@/` alias Next.js code uses) -- this
 * file is bundled by Netlify's own Functions toolchain, separately from
 * the Next.js build, and cannot rely on the Next.js tsconfig path alias
 * being honored there.
 *
 * REQUIRES the site's Netlify plan to support Scheduled Functions --
 * this repository cannot verify or enable that from here. If Deep
 * Discovery scans appear to hang at 0 progress after being started, the
 * first thing to check is whether this function is actually deployed and
 * firing (Netlify's Functions log for "deep-discovery-worker").
 */
const handler = async () => {
  if (!isGraphConfigured()) {
    // Deep Discovery isn't provisioned yet (SUPABASE_URL/
    // SUPABASE_SERVICE_ROLE_KEY not set) -- a clean no-op, never a crash
    // loop on every scheduled tick before the user has set up a database.
    return new Response(JSON.stringify({ skipped: true, reason: "Partnership Graph not configured" }), {
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const result = await runWorkerTick();
    console.log(JSON.stringify({ stage: "deep_discovery_worker_tick", ...result }));
    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ stage: "deep_discovery_worker_tick", error: message }));
    return new Response(JSON.stringify({ error: "worker tick failed" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};

export default handler;

export const config: Config = {
  // Every minute -- discovery_jobs.claim_next_job's own row-level locking
  // (FOR UPDATE SKIP LOCKED) makes overlapping ticks safe even if one
  // invocation is still finishing when the next fires.
  schedule: "* * * * *",
};
