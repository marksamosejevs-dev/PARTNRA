import { ClassifiedResult, SourceItem } from "./types";

export class ClassifierError extends Error {}

const EVIDENCE_TYPES = ["Promo code", "Affiliate link", "Referral", "Review", "Ambassador", "Partner"] as const;
const CANDIDATE_TYPES = ["Creator", "Publisher", "Reviewer", "Site"] as const;

/**
 * Classification latency scales with how many items are in one call --
 * both the input prompt and, more importantly, the structured output the
 * model has to produce (one classification per item). A real deployed
 * scan with a 29-item pool took long enough to exceed the per-stage
 * timeout. Capping the AI call's input keeps it fast and predictable;
 * scoreUnverified below can still score the FULL pool deterministically
 * if the AI call doesn't complete in time, so nothing discovered is lost,
 * only left unverified.
 */
export const MAX_CLASSIFY_INPUT = 15;

const TOOL_NAME = "report_classifications";

function buildSystemPrompt(brand: string, domain: string): string {
  return `You are a conservative research analyst for Partnra, an affiliate-recruitment intelligence tool.

You are given public web, YouTube, Instagram and TikTok results gathered while searching for people or sites already commercially promoting the brand "${brand}" (domain: ${domain}). Each item already states which platform it came from — you do not need to guess that.

For EACH result, decide:
1. Is this result actually about "${brand}" specifically (not a different, similarly-named brand)?
2. Is this commercial promotion — not a news article, forum comment, press release, or the brand's own page?
3. Is there real evidence of an affiliate/referral/ambassador relationship: a personalized promo code, an affiliate/referral link, a disclosed partnership, a "link in bio" discount, or a dedicated commercial review/video with a purchase/referral call to action?
4. Who is the creator or publisher?
5. What exactly is the evidence, in one sentence, closely paraphrasing what you saw in the title/snippet?
6. How strong is that evidence?

Rules:
- NEVER infer an affiliate relationship purely from a brand mention. A normal customer review, a casual forum/comment, a news article, or an unrelated coupon-aggregator page is NOT sufficient — mark validCandidate: false.
- Only set validCandidate: true when there is a personalized promo code, an affiliate/referral link, a disclosed ambassador/partner relationship, or a dedicated commercial review/video with a clear purchase/referral call to action.
- confidence 90-100: explicit personalized promo code, affiliate disclosure, or referral link tied directly to the creator.
- confidence 80-89: strong commercial recommendation plus a clear purchase/referral signal.
- confidence 70-79: multiple promotional signals, but the affiliate relationship is not fully explicit.
- Below 70: mark validCandidate: false.
- Never invent a name, profile URL, promo code, or contact detail that is not visible in the title/snippet — use null if unknown.
- Return exactly one classification per input result, referencing its index.`;
}

const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    classifications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          validCandidate: { type: "boolean" },
          name: { type: ["string", "null"] },
          type: { type: ["string", "null"], enum: [...CANDIDATE_TYPES, null] },
          profileUrl: { type: ["string", "null"] },
          evidenceType: { type: ["string", "null"], enum: [...EVIDENCE_TYPES, null] },
          evidence: { type: "string" },
          promoCode: { type: ["string", "null"] },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          reason: { type: "string" },
        },
        required: ["index", "validCandidate", "evidence", "confidence", "reason"],
      },
    },
  },
  required: ["classifications"],
};

export async function classifyResults(
  items: SourceItem[],
  brand: string,
  domain: string,
  signal: AbortSignal
): Promise<ClassifiedResult[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ClassifierError("ANTHROPIC_API_KEY is not configured");
  }

  const model = process.env.LLM_MODEL || "claude-haiku-4-5-20251001";

  const numbered = items
    .map((r, i) => `[${i}] PLATFORM: ${r.platform}\nTITLE: ${r.title}\nURL: ${r.url}\nSNIPPET: ${r.snippet}`)
    .join("\n\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: buildSystemPrompt(brand, domain),
      messages: [
        { role: "user", content: `Classify these ${items.length} results:\n\n${numbered}` },
      ],
      tools: [
        {
          name: TOOL_NAME,
          description: "Report the classification of each result.",
          input_schema: CLASSIFY_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
    }),
    signal,
  });

  if (!res.ok) {
    throw new ClassifierError(`LLM classifier returned ${res.status}`);
  }

  const data = (await res.json()) as { content?: Array<{ type: string; input?: unknown }> };
  const toolUse = data.content?.find((block) => block.type === "tool_use");
  const parsed = toolUse?.input as { classifications?: unknown[] } | undefined;

  if (!parsed?.classifications || !Array.isArray(parsed.classifications)) {
    throw new ClassifierError("LLM classifier returned an unexpected shape");
  }

  return parsed.classifications
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item): ClassifiedResult => {
      const index = typeof item.index === "number" ? item.index : -1;
      const source = items[index];
      return {
        validCandidate: item.validCandidate === true,
        name: typeof item.name === "string" ? item.name : null,
        type: (CANDIDATE_TYPES as readonly string[]).includes(item.type as string)
          ? (item.type as ClassifiedResult["type"])
          : null,
        // Platform is known with certainty from the provider that found this
        // item — never left to the LLM to guess.
        platform: source?.platform ?? "Web",
        profileUrl:
          source?.profileUrl ?? (typeof item.profileUrl === "string" ? item.profileUrl : null),
        sourceUrl: source?.url ?? "",
        evidenceType: (EVIDENCE_TYPES as readonly string[]).includes(item.evidenceType as string)
          ? (item.evidenceType as ClassifiedResult["evidenceType"])
          : null,
        evidence: typeof item.evidence === "string" ? item.evidence : "",
        // This classifier only ever validates a real relationship with the
        // named competitor brand itself — the strongest evidence tier.
        signalStrength: "strong",
        verified: true,
        promoCode: typeof item.promoCode === "string" ? item.promoCode : null,
        confidence: typeof item.confidence === "number" ? item.confidence : 0,
        reason: typeof item.reason === "string" ? item.reason : "",
      };
    })
    .filter((item) => item.sourceUrl);
}

export function isClassifierConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const CATEGORY_EVIDENCE_TYPES = ["Category affiliate", "Category review", "Distributor fit"] as const;

/**
 * Maps evidenceType to signalStrength in code, not the model's own judgement
 * -- keeps the label the user actually sees consistent and auditable rather
 * than depending on the LLM picking the same tier every time for the same
 * evidence type.
 */
const CATEGORY_STRENGTH: Record<(typeof CATEGORY_EVIDENCE_TYPES)[number], "medium" | "potential"> = {
  "Category affiliate": "medium",
  "Category review": "medium",
  "Distributor fit": "potential",
};

function buildCategorySystemPrompt(category: string): string {
  return `You are a conservative research analyst for Partnra, a partner-discovery tool.

The user's business could not be confidently matched to enough comparable competitor brands with an established partner presence, so you are given public web, YouTube and OpenAI web-search results gathered while searching directly for people, publishers or companies already commercially engaged with the product category "${category}" -- not tied to any specific named competitor.

For EACH result, decide:
1. Is this genuinely about the category "${category}" (not an unrelated topic that just shares a keyword)?
2. What kind of real commercial engagement does it show, if any:
   - "Category affiliate": an active affiliate/referral/sponsorship arrangement for products in this category (a promo code, tracked link, disclosed partnership) -- just not tied to one specific competitor brand.
   - "Category review": substantive, dedicated review/comparison/roundup content specifically about this product category, with real purchase or recommendation intent (not a passing mention).
   - "Distributor fit": a real retailer, distributor or reseller whose actual, visible catalogue or business already carries comparable products -- evidenced by an actual catalogue/product listing page, never guessed from a generic "About us" page.
3. Who is the creator, publisher, or company?
4. What exactly is the evidence, in one sentence, closely paraphrasing what you saw in the title/snippet?
5. How strong is that evidence, as a confidence 0-100 within this category strategy (these numbers are NOT comparable to a direct-competitor match -- they only rank within this batch):
   - 80-100: explicit, clearly commercial engagement with the category (a working affiliate mechanism, or a dedicated, substantial review with clear intent).
   - 60-79: genuine, real coverage or catalogue fit, but the commercial relationship or intent is less explicit.
   - Below 60: not enough real evidence -- mark validCandidate: false.

Rules:
- NEVER infer any of the three evidence types from a single generic brand/category mention, a news article, a forum comment, or an unrelated coupon-aggregator page.
- NEVER claim "Distributor fit" without a real, visible catalogue/product page as evidence -- not speculation about what a company might plausibly sell.
- Never invent a name, profile URL, or contact detail not visible in the title/snippet -- use null if unknown.
- Return exactly one classification per input result, referencing its index.`;
}

const CATEGORY_CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    classifications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          validCandidate: { type: "boolean" },
          name: { type: ["string", "null"] },
          type: { type: ["string", "null"], enum: [...CANDIDATE_TYPES, null] },
          profileUrl: { type: ["string", "null"] },
          evidenceType: { type: ["string", "null"], enum: [...CATEGORY_EVIDENCE_TYPES, null] },
          evidence: { type: "string" },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          reason: { type: "string" },
        },
        required: ["index", "validCandidate", "evidence", "confidence", "reason"],
      },
    },
  },
  required: ["classifications"],
};

/**
 * Fallback classifier for Strategy B/C/D (category/product/commercial-fit
 * discovery) -- used whenever competitor-based discovery is unavailable or
 * too weak on its own. Evidence bar is real but strategy-relative: it never
 * claims a competitor relationship that doesn't exist, only genuine category-
 * level commercial engagement, tagged with the honest, weaker signalStrength
 * this deserves (never "strong").
 */
export async function classifyCategoryResults(
  items: SourceItem[],
  category: string,
  signal: AbortSignal
): Promise<ClassifiedResult[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ClassifierError("ANTHROPIC_API_KEY is not configured");
  }

  const model = process.env.LLM_MODEL || "claude-haiku-4-5-20251001";

  const numbered = items
    .map((r, i) => `[${i}] PLATFORM: ${r.platform}\nTITLE: ${r.title}\nURL: ${r.url}\nSNIPPET: ${r.snippet}`)
    .join("\n\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: buildCategorySystemPrompt(category),
      messages: [
        { role: "user", content: `Classify these ${items.length} results:\n\n${numbered}` },
      ],
      tools: [
        {
          name: TOOL_NAME,
          description: "Report the classification of each result.",
          input_schema: CATEGORY_CLASSIFY_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
    }),
    signal,
  });

  if (!res.ok) {
    throw new ClassifierError(`LLM category classifier returned ${res.status}`);
  }

  const data = (await res.json()) as { content?: Array<{ type: string; input?: unknown }> };
  const toolUse = data.content?.find((block) => block.type === "tool_use");
  const parsed = toolUse?.input as { classifications?: unknown[] } | undefined;

  if (!parsed?.classifications || !Array.isArray(parsed.classifications)) {
    throw new ClassifierError("LLM category classifier returned an unexpected shape");
  }

  return parsed.classifications
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item): ClassifiedResult | null => {
      const index = typeof item.index === "number" ? item.index : -1;
      const source = items[index];
      const evidenceType = (CATEGORY_EVIDENCE_TYPES as readonly string[]).includes(item.evidenceType as string)
        ? (item.evidenceType as (typeof CATEGORY_EVIDENCE_TYPES)[number])
        : null;
      if (!evidenceType) return null; // no basis to assign a signalStrength — drop rather than guess

      return {
        validCandidate: item.validCandidate === true,
        name: typeof item.name === "string" ? item.name : null,
        type: (CANDIDATE_TYPES as readonly string[]).includes(item.type as string)
          ? (item.type as ClassifiedResult["type"])
          : null,
        platform: source?.platform ?? "Web",
        profileUrl:
          source?.profileUrl ?? (typeof item.profileUrl === "string" ? item.profileUrl : null),
        sourceUrl: source?.url ?? "",
        evidenceType,
        evidence: typeof item.evidence === "string" ? item.evidence : "",
        signalStrength: CATEGORY_STRENGTH[evidenceType],
        verified: true,
        promoCode: null,
        confidence: typeof item.confidence === "number" ? item.confidence : 0,
        reason: typeof item.reason === "string" ? item.reason : "",
      };
    })
    .filter((item): item is ClassifiedResult => item !== null && !!item.sourceUrl);
}

const UNVERIFIED_SIGNAL_WORDS = [
  "promo code",
  "discount code",
  "affiliate",
  "referral",
  "partner",
  "sponsored",
  "ambassador",
  "review",
  "commission",
  "use my code",
];

/**
 * Deterministic, non-AI fallback for when real classification couldn't
 * complete in time (or failed outright) -- exists so an already-discovered,
 * real evidence pool is never simply thrown away just because Anthropic
 * ranking ran out of budget. This is a plain keyword heuristic over the
 * title/snippet already returned by a real provider (Serper/OpenAI/
 * YouTube) -- no model reads or judges it, so every result is tagged
 * verified: false and capped at a confidence well below any AI-verified
 * band, and evidenceType is left null rather than asserted (never claim
 * "Promo code" or "Affiliate link" without an LLM actually having read the
 * evidence for it). validCandidate is always true here: these already
 * passed real discovery, they just haven't been AI-judged, so there's no
 * concept of the classifier "rejecting" one.
 */
export function scoreUnverified(items: SourceItem[]): ClassifiedResult[] {
  return items.map((item) => {
    const text = `${item.title} ${item.snippet}`.toLowerCase();
    const matched = UNVERIFIED_SIGNAL_WORDS.filter((w) => text.includes(w));
    const confidence = Math.min(30 + matched.length * 8, 55);

    return {
      validCandidate: true,
      name: item.title || null,
      type: item.source === "YouTube" ? "Creator" : null,
      platform: item.platform,
      profileUrl: item.profileUrl,
      sourceUrl: item.url,
      evidenceType: null,
      evidence: item.snippet || "(no snippet available)",
      signalStrength: "potential",
      verified: false,
      promoCode: null,
      confidence,
      reason:
        matched.length > 0
          ? `Not yet AI-verified — surfaced by search; the title/snippet mentions ${matched.slice(0, 2).join(", ")}.`
          : "Not yet AI-verified — surfaced by search, shown as a lower-confidence lead pending full evidence review.",
    };
  });
}
