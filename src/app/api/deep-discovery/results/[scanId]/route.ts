import { NextRequest, NextResponse } from "next/server";
import { isGraphConfigured } from "@/lib/graph/client";
import { getScan, getQualifiedOpportunitiesPage } from "@/lib/graph/repository";

// Never cached -- a fresh, real page of persisted opportunities every call.
export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * Paginated Deep Discovery results -- deliberately separate from the
 * lightweight status endpoint (see its own comment): the status endpoint
 * is polled every few seconds while a scan runs and must never carry a
 * full result set; this endpoint is fetched once the scan is terminal (and
 * again only on an explicit "Load more"), never on a polling tick.
 *
 * `limit`/`offset` query params -- offset-based, not cursor-based: the
 * underlying set is a completed (or steadily-growing) scan's own
 * opportunities ordered by a stable column (partnra_fit), so plain
 * offset pagination is sufficient for a first "load more" experience
 * without the added complexity of keyset pagination.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ scanId: string }> }) {
  if (!isGraphConfigured()) {
    return errorResponse("Deep Discovery is not configured yet.", 501);
  }
  const { scanId } = await context.params;

  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit"));
  const offsetParam = Number(searchParams.get("offset"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), MAX_LIMIT) : DEFAULT_LIMIT;
  const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? Math.floor(offsetParam) : 0;

  try {
    const scan = await getScan(scanId);
    if (!scan) return errorResponse("Scan not found.", 404);

    const { items, hasMore } = await getQualifiedOpportunitiesPage(scan.business_id, { limit, offset });

    return NextResponse.json({ items, limit, offset, hasMore }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Something went wrong reading Deep Discovery results.", 500);
  }
}
