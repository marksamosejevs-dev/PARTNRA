import { NextRequest, NextResponse } from "next/server";
import { normalizeBrandUrl } from "@/lib/discovery/domain";
import { isGraphConfigured } from "@/lib/graph/client";
import { getBusinessByDomain, createScan, createDiscoveryJobs, updateScan } from "@/lib/graph/repository";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Starts a real, persisted, asynchronous Deep Discovery scan (Section 8,
 * 21, 43). This endpoint itself does almost no work -- one lookup, one
 * insert, one job enqueue -- and returns immediately with a scan id; all
 * the actual research happens later, in netlify/functions/deep-discovery-
 * worker.ts's scheduled ticks, entirely independent of this request or
 * whether the browser stays open.
 *
 * Deliberately requires Quick Scan to have already run for this domain
 * (see business.partner_intent_profile) rather than accepting a bare
 * business description here -- Deep Discovery REUSES the Partner Intent
 * Profile Quick Scan already computed (Section 7: "reuse existing
 * business understanding... do not re-analyse unnecessarily"), it never
 * duplicates that AI analysis call.
 */
export async function POST(request: NextRequest) {
  if (!isGraphConfigured()) {
    return errorResponse("Deep Discovery is not configured yet.", 501);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  const { brandUrl } = (body ?? {}) as { brandUrl?: unknown };
  if (typeof brandUrl !== "string") {
    return errorResponse("brandUrl is required.", 400);
  }

  const url = normalizeBrandUrl(brandUrl);
  if (!url) {
    return errorResponse("Enter a valid website, e.g. yourbrand.com", 400);
  }
  const domain = url.hostname.replace(/^www\./i, "");

  try {
    const business = await getBusinessByDomain(domain);
    if (!business || !business.partner_intent_profile) {
      return errorResponse(
        "Run Quick Scan for this business first -- Deep Discovery reuses its Partner Intent Profile instead of re-analysing the business.",
        409
      );
    }

    const scan = await createScan({ businessId: business.id, scanType: "deep" });

    try {
      await createDiscoveryJobs([{ scanId: scan.id, jobType: "comparable_brand_expansion" }]);
    } catch (jobErr) {
      // The scan row above is already durably committed -- if its initial
      // job never gets created, nothing else will ever touch this scan
      // (the worker only ever reacts to discovery_jobs rows, never scans
      // rows directly), leaving it orphaned in 'queued' forever. Mark it
      // honestly failed right now rather than silently leaving that to the
      // next worker tick's reclaim_orphan_scans safety net (migration
      // 0010) -- this best-effort update failing too is not fatal, since
      // that safety net still catches it within one lease window either way.
      const message = jobErr instanceof Error ? jobErr.message : String(jobErr);
      try {
        await updateScan(scan.id, { status: "failed", completed_at: new Date().toISOString(), error: message });
      } catch {
        // Best-effort only -- the real error is already about to be returned below.
      }
      throw jobErr;
    }

    return NextResponse.json({ scanId: scan.id, status: scan.status });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Something went wrong starting Deep Discovery.", 500);
  }
}
