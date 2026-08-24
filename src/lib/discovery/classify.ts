import { ClassifiedResult, SourceItem } from "./types";

export class ClassifierError extends Error {}

const EVIDENCE_TYPES = ["Promo code", "Affiliate link", "Referral", "Review", "Ambassador", "Partner"] as const;
const CANDIDATE_TYPES = ["Creator", "Publisher", "Reviewer", "Site"] as const;

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
