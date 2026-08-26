import { NextRequest, NextResponse } from "next/server";
import { isGraphConfigured } from "@/lib/graph/client";
import { getScan, getOpportunitiesForBusiness, countJobsByStatus, getBusinessById } from "@/lib/graph/repository";

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
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ scanId: string }> }) {
  if (!isGraphConfigured()) {
    return errorResponse("Deep Discovery is not configured yet.", 501);
  }
  const { scanId } = await context.params;

  try {
    const scan = await getScan(scanId);
    if (!scan) return errorResponse("Scan not found.", 404);

    const [opportunities, jobCounts, business] = await Promise.all([
      getOpportunitiesForBusiness(scan.business_id),
      countJobsByStatus(scanId),
      getBusinessById(scan.business_id),
    ]);

    // Only STRONG/GOOD opportunities are ever shown -- the same
    // never-fill-quotas-with-weak-candidates rule Quick Scan applies
    // (Section 15/28), never bypassed here either.
    const shown = opportunities.filter((o) => o.quality_tier !== "weak");
    const previewOpportunity = scan.preview_entity_id ? shown.find((o) => o.entity_id === scan.preview_entity_id) ?? null : null;
    const additionalOpportunityCount = previewOpportunity ? shown.length - 1 : shown.length;

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
          opportunitiesQualified: scan.opportunity_count,
          jobsQueued: jobCounts.queued,
          jobsRunning: jobCounts.running,
        },
        preview: previewOpportunity
          ? {
              name: previewOpportunity.entities.name,
              partnerType: previewOpportunity.partner_type,
              relationshipDirection: previewOpportunity.relationship_direction,
              geographicFit: previewOpportunity.geographic_fit,
              partnraFit: previewOpportunity.partnra_fit,
              evidenceConfidence: previewOpportunity.evidence_confidence,
              qualityTier: previewOpportunity.quality_tier,
              potentialRelationship: previewOpportunity.potential_relationship,
              applicationUrl: previewOpportunity.entities.application_url,
              contact: previewOpportunity.entities.public_contact,
            }
          : null,
        previewSelectionReason: scan.preview_selection_reason,
        // Real, not fabricated: exactly `shown.length` minus the one already
        // rendered as the preview -- never a guessed or padded number.
        additionalOpportunityCount,
        warnings: scan.warnings,
        error: scan.error,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Something went wrong reading Deep Discovery status.", 500);
  }
}
