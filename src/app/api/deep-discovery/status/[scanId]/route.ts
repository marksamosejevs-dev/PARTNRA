import { NextRequest, NextResponse } from "next/server";
import { isGraphConfigured } from "@/lib/graph/client";
import { getScan, countQualifiedOpportunities, countJobsByStatus, getBusinessById } from "@/lib/graph/repository";

// Status must always reflect the current DB row -- never a cached response
// from an earlier poll (Netlify/CDN/browser). This is a status check, not
// content that benefits from caching.
export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Read-only, fast, and entirely driven by what's actually persisted --
 * never a fabricated progress percentage (Section 22). The frontend polls
 * this while a tab happens to be open, but the underlying scan keeps
 * advancing via the scheduled worker regardless (Section 21: the browser
 * must not need to remain open).
 *
 * Deliberately lightweight -- this used to also fetch every opportunity
 * for the business (to pick one "preview" and count the rest), which
 * meant every 4-second poll downloaded the full result set just to throw
 * most of it away. Full results now live behind
 * /api/deep-discovery/results/[scanId] (paginated, fetched once on
 * completion, never on a polling tick) -- this endpoint only ever does a
 * cheap count query for the headline number.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ scanId: string }> }) {
  if (!isGraphConfigured()) {
    return errorResponse("Deep Discovery is not configured yet.", 501);
  }
  const { scanId } = await context.params;

  try {
    const scan = await getScan(scanId);
    if (!scan) return errorResponse("Scan not found.", 404);

    const [qualifiedOpportunities, jobCounts, business] = await Promise.all([
      countQualifiedOpportunities(scan.business_id),
      countJobsByStatus(scanId),
      getBusinessById(scan.business_id),
    ]);

    return NextResponse.json(
      {
        scanId: scan.id,
        status: scan.status,
        business: business ? { domain: business.domain, name: business.name } : null,
        progress: {
          comparableBrandsTarget: scan.comparable_brands_target,
          comparableBrandsAnalysed: scan.comparable_brands_analysed,
          signalsReviewed: scan.signals_reviewed,
          entitiesResolved: scan.entity_count,
          relationshipsFound: scan.relationship_count,
          // The real, user-facing count: quality_tier != 'weak', the same
          // bar the results list itself uses -- never scan.opportunity_count
          // directly (that raw counter includes weak-tier upserts and must
          // never be labeled "qualified" -- see migration 0006's comments
          // and countQualifiedOpportunities' own doc).
          opportunitiesQualified: qualifiedOpportunities,
          // Retained separately for anyone doing processing/telemetry on the
          // raw upsert count -- deliberately never rendered as a customer-
          // facing "qualified" number.
          rawOpportunitiesDiscovered: scan.opportunity_count,
          jobsQueued: jobCounts.queued,
          jobsRunning: jobCounts.running,
        },
        warnings: scan.warnings,
        error: scan.error,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Something went wrong reading Deep Discovery status.", 500);
  }
}
