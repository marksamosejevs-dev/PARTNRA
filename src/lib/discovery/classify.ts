import { CandidateType, ClassifiedResult, SourceItem } from "./types";
import { resolveEntity, computeFitScore, evidenceConfidenceLabel, classifyPartnerType } from "./entity";

export class ClassifierError extends Error {}

const EVIDENCE_TYPES = ["Promo code", "Affiliate link", "Referral", "Review", "Ambassador", "Partner"] as const;

/**
 * The requesting business's own Partner Intent Profile (see business.ts),
 * passed into classification so the model can tell "shares a keyword"
 * apart from "is actually the same commercial category/role" -- e.g. BBQ
 * smoker pellets vs. heating/fuel biomass pellets both contain "pellets",
 * but are different commercial categories; a page merely monetizing
 * content ("affiliate links") isn't relevant to a business it has no
 * category/role connection to. A minimal, decoupled shape (not imported
 * from business.ts directly) so classify.ts doesn't need to know that
 * module's full BusinessProfile shape -- route.ts builds this from it.
 */
export interface BusinessContext {
  category: string | null;
  businessModel: string | null;
  targetCustomers: string | null;
  market: string | null;
  commercialIntentConcepts: string[];
}

function buildBusinessContextBlock(context: BusinessContext): string {
  const lines = [
    `- Category: ${context.category ?? "unknown"}`,
    `- Business model: ${context.businessModel ?? "unknown"}`,
    `- Target customers: ${context.targetCustomers ?? "unknown"}`,
    `- Primary market/geography: ${context.market ?? "unknown"}`,
  ];
  if (context.commercialIntentConcepts.length > 0) {
    lines.push(`- Relevant partner-search concepts: ${context.commercialIntentConcepts.join(", ")}`);
  }
  return `
Business context for the company running this scan (use this to judge REAL relevance, not just shared vocabulary):
${lines.join("\n")}

CRITICAL semantic rule: a shared keyword is NOT evidence of relevance. Judge whether a result is genuinely about the SAME commercial category/product/role as this business, not merely whether it shares a word. For example, if this business sells heating/fuel biomass pellets, a page about BBQ smoker pellets shares the word "pellets" but is a completely different commercial category and market -- mark validCandidate: false. Likewise, evidence that an entity merely monetizes content in general (e.g. generic "affiliate links" with no stated category) does NOT by itself establish relevance to THIS business -- it must be both categorically relevant AND make commercial sense as a partner for what this business actually sells/does.`;
}

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

function buildSystemPrompt(brand: string, domain: string, businessContext: BusinessContext): string {
  return `You are a conservative research analyst for Partnra, an affiliate-recruitment intelligence tool.

You are given public web, YouTube, Instagram and TikTok results gathered while searching for people or sites already commercially promoting the COMPETITOR brand "${brand}" (domain: ${domain}). Each item already states which platform it came from — you do not need to guess that.
${buildBusinessContextBlock(businessContext)}

For EACH result, decide:
1. Is this result actually about "${brand}" specifically (not a different, similarly-named brand)?
2. Is this commercial promotion — not a news article, forum comment, press release, or the brand's own page?
3. Is there real evidence of an affiliate/referral/ambassador relationship: a personalized promo code, an affiliate/referral link, a disclosed partnership, a "link in bio" discount, or a dedicated commercial review/video with a purchase/referral call to action?
4. What exactly is the evidence, in one sentence, closely paraphrasing what you saw in the title/snippet?
5. How strong is that evidence?

Rules:
- NEVER infer an affiliate relationship purely from a brand mention. A normal customer review, a casual forum/comment, a news article, or an unrelated coupon-aggregator page is NOT sufficient — mark validCandidate: false.
- Only set validCandidate: true when there is a personalized promo code, an affiliate/referral link, a disclosed ambassador/partner relationship, or a dedicated commercial review/video with a clear purchase/referral call to action.
- A result that IS "${brand}"'s own official affiliate/partner program page (not a third party promoting it) still gets validCandidate: true here if it shows real affiliate-program evidence — route.ts separately reclassifies competitor-owned infrastructure after this step, so just judge the evidence honestly.
- confidence 90-100: explicit personalized promo code, affiliate disclosure, or referral link tied directly to the creator.
- confidence 80-89: strong commercial recommendation plus a clear purchase/referral signal.
- confidence 70-79: multiple promotional signals, but the affiliate relationship is not fully explicit.
- Below 70: mark validCandidate: false.
- Never invent a promo code or detail that is not visible in the title/snippet — use null if unknown.
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

/**
 * Entity identity (name/type/profileUrl/applicationUrl) is resolved
 * deterministically from the source item itself (see entity.ts) for every
 * classification path, AI or fallback alike -- never taken from the
 * model's own free-text guess, which in practice tends to just echo the
 * page/video title back as the "partner name" ("Peptide Sciences Promo
 * Code August 2026 - 30% OFF" is a page title, not an entity). This keeps
 * identity consistent across strategies, which is also what makes
 * cross-source dedup by entity (dedupe.ts) actually work.
 */
/** This scan's dynamically-generated partner-type priorities (see business.ts's BusinessProfile) -- which types matter is decided per business, never hardcoded per industry. */
export interface PartnerTypeIntent {
  prioritized: ReadonlySet<CandidateType>;
  deprioritized: ReadonlySet<CandidateType>;
}

function buildCandidateFields(
  source: SourceItem | undefined,
  signalStrength: "strong" | "medium" | "potential",
  verified: boolean,
  intent?: PartnerTypeIntent
) {
  const entity = source
    ? resolveEntity(source)
    : { name: null, profileUrl: null, type: "Other" as const, applicationUrl: null };
  return {
    name: entity.name,
    type: entity.type,
    profileUrl: entity.profileUrl,
    applicationUrl: entity.applicationUrl,
    evidenceConfidence: evidenceConfidenceLabel(signalStrength, verified),
    // Placeholder using sourceCount:1 -- dedupe.ts recomputes this after
    // merging duplicate sightings, when the real sourceCount is known.
    fitScore: computeFitScore({
      signalStrength,
      verified,
      type: entity.type,
      sourceCount: 1,
      hasApplicationRoute: !!entity.applicationUrl,
      prioritizedTypes: intent?.prioritized,
      deprioritizedTypes: intent?.deprioritized,
    }),
    // Cross-candidate templated/doorway-network detection can only run once
    // the full pool is assembled -- see dedupe.ts's flagDuplicateEvidenceNetworks,
    // which overwrites these once the real comparison is possible.
    similarEvidenceNetwork: false,
    similarEvidenceDomainCount: 0,
    // Only ever set later, from a real evidence-based heuristic (see
    // route.ts) -- never guessed here at initial classification time.
    potentialRelationship: null,
  };
}

export async function classifyResults(
  items: SourceItem[],
  brand: string,
  domain: string,
  businessContext: BusinessContext,
  signal: AbortSignal,
  intent?: PartnerTypeIntent
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
      system: buildSystemPrompt(brand, domain, businessContext),
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
      // This classifier only ever validates a real relationship with the
      // named competitor brand itself — the strongest evidence tier.
      const signalStrength = "strong" as const;
      const verified = true;
      return {
        validCandidate: item.validCandidate === true,
        // Platform is known with certainty from the provider that found this
        // item — never left to the LLM to guess.
        platform: source?.platform ?? "Web",
        sourceUrl: source?.url ?? "",
        evidenceType: (EVIDENCE_TYPES as readonly string[]).includes(item.evidenceType as string)
          ? (item.evidenceType as ClassifiedResult["evidenceType"])
          : null,
        evidence: typeof item.evidence === "string" ? item.evidence : "",
        signalStrength,
        verified,
        promoCode: typeof item.promoCode === "string" ? item.promoCode : null,
        confidence: typeof item.confidence === "number" ? item.confidence : 0,
        reason: typeof item.reason === "string" ? item.reason : "",
        ...buildCandidateFields(source, signalStrength, verified, intent),
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

function buildCategorySystemPrompt(category: string, businessContext: BusinessContext): string {
  return `You are a conservative research analyst for Partnra, a partner-discovery tool.

The user's business could not be confidently matched to enough comparable competitor brands with an established partner presence, so you are given public web, YouTube and OpenAI web-search results gathered while searching directly for people, publishers or companies already commercially engaged with the product category "${category}" -- not tied to any specific named competitor.
${buildBusinessContextBlock(businessContext)}

For EACH result, decide:
1. Is this genuinely about the SAME commercial category as "${category}" for THIS business (not a different category/product/market that happens to share a keyword -- see the semantic rule above)?
2. Does the entity's own commercial role actually make sense as a partner for this business, given its business model/target customers above -- not just "it monetizes something" or "it has affiliate links" in general?
3. What kind of real commercial engagement does it show, if any:
   - "Category affiliate": an active affiliate/referral/sponsorship arrangement for products in this category (a promo code, tracked link, disclosed partnership) -- just not tied to one specific competitor brand.
   - "Category review": either (a) substantive, dedicated review/comparison/roundup content specifically about this product category with real purchase or recommendation intent, OR (b) a creator/publisher/channel whose visible content clearly, repeatedly and commercially engages with this category -- ongoing coverage, comparisons, or ranked recommendations within it -- even without one explicit purchase call-to-action in this particular snippet. A single passing mention or an unrelated brand namecheck is still NOT enough either way.
   - "Distributor fit": a real retailer, distributor, reseller, publisher or creator whose actual, visible catalogue/content shows a genuinely plausible commercial fit for this category (e.g. a real product listing page, or a channel/site clearly operating commercially within adjacent categories) -- but with no confirmed existing relationship to any specific brand in this category. Never guessed from a generic "About us" page or from category relevance alone with no real evidence of that fit visible.
4. What exactly is the evidence, in one sentence, closely paraphrasing what you saw in the title/snippet?
5. How strong is that evidence, as a confidence 0-100 within this category strategy (these numbers are NOT comparable to a direct-competitor match -- they only rank within this batch):
   - 80-100: explicit, clearly commercial engagement with the SAME category and a role that plausibly fits this business.
   - 60-79: genuine, real coverage or catalogue fit, but the commercial relationship, category match, or role fit is less explicit.
   - Below 60: not enough real evidence, or the category/role match is unclear -- mark validCandidate: false.

Rules:
- NEVER infer any of the three evidence types from a single generic brand/category mention, a news article, a forum comment, or an unrelated coupon-aggregator page.
- NEVER treat a shared keyword as category relevance -- e.g. "pellets" alone does not mean heating/fuel biomass pellets and BBQ smoker pellets are the same category; a law firm's compliance content does not mean it is a partner for every other regulated business. Judge the actual product/service/audience, not the word.
- NEVER claim "Distributor fit" without a real, visible catalogue/product page as evidence -- not speculation about what a company might plausibly sell.
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
  businessContext: BusinessContext,
  signal: AbortSignal,
  intent?: PartnerTypeIntent
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
      system: buildCategorySystemPrompt(category, businessContext),
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

      const signalStrength = CATEGORY_STRENGTH[evidenceType];
      const verified = true;
      return {
        validCandidate: item.validCandidate === true,
        platform: source?.platform ?? "Web",
        sourceUrl: source?.url ?? "",
        evidenceType,
        evidence: typeof item.evidence === "string" ? item.evidence : "",
        signalStrength,
        verified,
        promoCode: null,
        confidence: typeof item.confidence === "number" ? item.confidence : 0,
        reason: typeof item.reason === "string" ? item.reason : "",
        ...buildCandidateFields(source, signalStrength, verified, intent),
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

// Types this deterministic scorer considers to already have real affiliate/
// audience infrastructure -- meaningfully more useful as a partner prospect
// than a generic scraped coupon-aggregator hit, even at similar keyword
// density. Kept separate from (and smaller a boost than) computeFitScore's
// own type bonus in entity.ts: this only nudges the *evidence* confidence
// number itself, not the fit score.
const RICH_EVIDENCE_TYPES = new Set<CandidateType>([
  "Affiliate",
  "Affiliate Network",
  "Review site",
  "Creator",
  "Distributor",
  "Wholesaler",
  "Importer",
  "Professional services firm",
]);

/**
 * Deterministic, non-AI fallback for when real classification couldn't
 * complete in time (or failed outright), or for AI-rejected/never-sent
 * items that still show a real commercial-signal keyword (see
 * scoreUnverifiedIfSignal) -- exists so an already-discovered, real
 * evidence pool is never simply thrown away. This is a plain heuristic
 * over the title/snippet/URL already returned by a real provider -- no
 * model reads or judges it, so every result is tagged verified: false and
 * capped at a confidence well below any AI-verified band, and evidenceType
 * is left null rather than asserted (never claim "Promo code" or
 * "Affiliate link" without an LLM actually having read the evidence for
 * it). validCandidate is always true here: these already passed real
 * discovery, they just haven't been AI-judged, so there's no concept of
 * the classifier "rejecting" one.
 *
 * The confidence formula intentionally varies on more than raw keyword
 * count (a coarse "matched.length * 8" produced identical scores for
 * different evidence purely by coincidence in a real test) -- it also
 * weighs the resolved partner type (a generic coupon aggregator is
 * genuinely less differentiated evidence than a page showing real
 * affiliate-program language) and whether a concrete discount pattern
 * (e.g. "30% off") is actually present, not just implied by a keyword.
 *
 * A plain keyword scorer genuinely cannot disambiguate "same word,
 * different category" the way an LLM reading real context can (BBQ smoker
 * pellets vs. heating/fuel biomass pellets both match "pellets") -- that
 * real semantic judgement only happens in the AI classification path (see
 * classifyCategoryResults). `categoryPhrases`, when the caller has them
 * (this business's own detected category/keywords/commercial-intent
 * concepts), is an honest, limited backstop: it doesn't prove the category
 * matches, it only down-weights items with little to no word overlap with
 * this business's own vocabulary, which is weaker evidence of relevance
 * than a generic affiliate/coupon keyword hit alone. Word-level overlap
 * (not a whole-phrase substring match) because a real page rarely repeats
 * an AI-generated concept phrase verbatim -- a light singularization
 * (strip a trailing "s") bridges the extremely common "pellet"/"pellets"
 * case without attempting real stemming.
 */
function singularize(word: string): string {
  return word.replace(/s$/i, "");
}

function significantWords(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .map(singularize);
}

export function scoreUnverified(
  items: SourceItem[],
  categoryPhrases: string[] = [],
  intent?: PartnerTypeIntent
): ClassifiedResult[] {
  const phraseWordSets = categoryPhrases.map(significantWords).filter((words) => words.length > 0);

  return items.map((item) => {
    const text = `${item.title} ${item.snippet}`.toLowerCase();
    const matched = UNVERIFIED_SIGNAL_WORDS.filter((w) => text.includes(w));
    const type = classifyPartnerType(item);

    const textWords = new Set(
      text
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .map(singularize)
    );
    const hasCategoryOverlap =
      phraseWordSets.length === 0 ||
      phraseWordSets.some((words) => words.filter((w) => textWords.has(w)).length / words.length >= 0.5);

    let confidence = 22 + Math.min(matched.length * 6, 18);
    if (RICH_EVIDENCE_TYPES.has(type)) confidence += 8;
    if (type === "Coupon publisher") confidence -= 6;
    if (/\b\d{1,3}\s?%\s*(off|discount)\b/i.test(text)) confidence += 5;
    if (!hasCategoryOverlap) confidence -= 10;
    confidence = Math.max(15, Math.min(58, Math.round(confidence)));

    const signalStrength = "potential" as const;
    const verified = false;

    return {
      validCandidate: true,
      platform: item.platform,
      sourceUrl: item.url,
      evidenceType: null,
      evidence: item.snippet || "(no snippet available)",
      signalStrength,
      verified,
      promoCode: null,
      confidence,
      reason:
        matched.length > 0
          ? `Not yet AI-verified — surfaced by search; the title/snippet mentions ${matched.slice(0, 2).join(", ")}.`
          : "Not yet AI-verified — surfaced by search, shown as a lower-confidence lead pending full evidence review.",
      ...buildCandidateFields(item, signalStrength, verified, intent),
    };
  });
}

/**
 * Same deterministic scoring as scoreUnverified, but keeps only items where
 * the keyword heuristic actually found something (at least one real
 * commercial-signal word in the title/snippet) -- for rescuing real search
 * signal that the AI classifier saw but didn't judge strong enough to
 * confirm a relationship, or that never reached the classifier at all
 * because the input was capped for speed. A pure brand/category mention
 * with no commercial-signal language at all still gets dropped here: this
 * is "surface real signal AI didn't confirm", not "show literally
 * everything discovered".
 */
export function scoreUnverifiedIfSignal(
  items: SourceItem[],
  categoryPhrases: string[] = [],
  intent?: PartnerTypeIntent
): ClassifiedResult[] {
  return scoreUnverified(items, categoryPhrases, intent).filter((r) => r.confidence > 27);
}

/**
 * Picks up to `max` items for the AI classification call, sampling evenly
 * across providers (source) rather than taking the pool in raw order --
 * pool order happens to correlate with which source ran first
 * (Web/OpenAI/YouTube), so a naive prefix slice could send the AI call
 * nothing but Serper results and silently exclude every YouTube item from
 * ever being classified, regardless of what they actually contain.
 */
export function sampleAcrossSources(pool: SourceItem[], max: number): SourceItem[] {
  const bySource = new Map<string, SourceItem[]>();
  for (const item of pool) {
    const group = bySource.get(item.source);
    if (group) group.push(item);
    else bySource.set(item.source, [item]);
  }
  const groups = Array.from(bySource.values());
  const result: SourceItem[] = [];
  for (let i = 0; result.length < max && groups.some((g) => i < g.length); i++) {
    for (const group of groups) {
      if (result.length >= max) break;
      if (i < group.length) result.push(group[i]);
    }
  }
  return result;
}
