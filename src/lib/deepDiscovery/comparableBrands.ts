import { BusinessProfile } from "../discovery/business";
import { resolveCompetitorDomain, ResolvedCompetitor } from "../discovery/competitors";
import { DEEP_DISCOVERY_LIMITS } from "./limits";

export class BrandExpansionError extends Error {}

const TOOL_NAME = "report_additional_brands";

/**
 * Quick Scan's own business-analysis prompt caps competitorNames at 3 --
 * fine for a fast synchronous scan, not enough for Deep Discovery's "up to
 * 10-20 credible comparable brands" target (Section 8). This is a
 * SEPARATE, deliberately narrow follow-up prompt asking for MORE names
 * given the SAME already-generated Partner Intent Profile -- never a
 * second full business-analysis call, and never itself the source of
 * truth for whether a brand is real: every name this returns still goes
 * through resolveComparableBrands' live-search resolution below, which is
 * what actually decides whether a brand enters the graph. An AI
 * hallucination that fails to resolve to a real domain is silently
 * dropped, never fabricated into the graph.
 */
function buildExpansionPrompt(profile: BusinessProfile, existingNames: string[]): string {
  return `A business has this profile:
- Category: ${profile.category ?? "unknown"}
- Business model: ${profile.businessModel ?? "unknown"}
- Target customers: ${profile.targetCustomers ?? "unknown"}
- Market/geography: ${profile.market ?? "unknown"}
- Sells: ${profile.keywords.join(", ") || "unknown"}

Already-known comparable/competitor brands: ${existingNames.length > 0 ? existingNames.join(", ") : "none yet"}.

List up to ${DEEP_DISCOVERY_LIMITS.maxBrandExpansionCandidates} ADDITIONAL real, currently-operating comparable or competitor brands in the SAME commercial category, selling a genuinely comparable product/service to a similar customer -- not merely sharing a keyword. Do not repeat any already-known brand.

Prefer brands that plausibly already have a visible partner/affiliate ecosystem -- e.g. ones known to run an affiliate program, referral program, ambassador program, or sponsored-creator/promo-code partnerships -- since those are the ones Deep Discovery can most productively investigate for real, evidenced partner relationships. This is a preference, not a requirement: still include a genuinely comparable brand even if you're unsure whether it has such a program.`;
}

const SCHEMA = {
  type: "object",
  properties: {
    brands: { type: "array", items: { type: "string" }, maxItems: DEEP_DISCOVERY_LIMITS.maxBrandExpansionCandidates },
  },
  required: ["brands"],
};

/** Only ever a candidate LIST -- never trusted as a real brand until resolveComparableBrands below verifies it against a live search. */
export async function expandComparableBrandNames(
  profile: BusinessProfile,
  existingNames: string[],
  signal: AbortSignal
): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new BrandExpansionError("ANTHROPIC_API_KEY is not configured");
  const model = process.env.LLM_MODEL || "claude-haiku-4-5-20251001";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system:
        "You are a conservative market-research analyst. Only name a company you are confident actually exists and currently operates in the stated category. If you are not confident a name is real, omit it entirely -- never invent a plausible-sounding brand name to fill the list. Returning fewer names, or none, is the honest answer when you are not sure.",
      messages: [{ role: "user", content: buildExpansionPrompt(profile, existingNames) }],
      tools: [{ name: TOOL_NAME, description: "Report additional comparable brand names.", input_schema: SCHEMA }],
      tool_choice: { type: "tool", name: TOOL_NAME },
    }),
    signal,
  });

  if (!res.ok) throw new BrandExpansionError(`Comparable-brand expansion LLM call returned ${res.status}`);

  const data = (await res.json()) as { content?: Array<{ type: string; input?: unknown }> };
  const toolUse = data.content?.find((b) => b.type === "tool_use");
  const parsed = toolUse?.input as { brands?: unknown } | undefined;
  if (!parsed || !Array.isArray(parsed.brands)) return [];

  const existingLower = new Set(existingNames.map((n) => n.toLowerCase()));
  return parsed.brands
    .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
    .filter((b) => !existingLower.has(b.toLowerCase()))
    .slice(0, DEEP_DISCOVERY_LIMITS.maxBrandExpansionCandidates);
}

/**
 * Resolves a list of candidate names to real domains via the SAME live-
 * search resolution Quick Scan uses (never a separate, laxer path) --
 * resolveCompetitorDomain drops any name that doesn't resolve to a
 * plausible official-site result, so an AI hallucination never becomes a
 * graph Brand. Deduplicates by resolved domain (two different suggested
 * names resolving to the same real company collapse to one).
 */
export async function resolveComparableBrands(names: string[], signal: AbortSignal): Promise<ResolvedCompetitor[]> {
  const resolved = await Promise.all(names.map((name) => resolveCompetitorDomain(name, signal)));
  const seenDomains = new Set<string>();
  const result: ResolvedCompetitor[] = [];
  for (const r of resolved) {
    if (!r || seenDomains.has(r.domain)) continue;
    seenDomains.add(r.domain);
    result.push(r);
  }
  return result;
}
