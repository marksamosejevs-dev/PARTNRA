import { promises as dns } from "dns";

export class BusinessAnalysisError extends Error {}

const MAX_HOMEPAGE_BYTES = 2_000_000;
const MAX_BODY_TEXT_CHARS = 4000;

function isPrivateIp(ip: string): boolean {
  if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.)/.test(ip)) return true;
  const m172 = ip.match(/^172\.(\d{1,3})\./);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (ip === "::1") return true;
  if (/^fe80:/i.test(ip)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true;
  return false;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export interface HomepageText {
  title: string;
  description: string;
  bodyText: string;
}

/**
 * Fetches the user's own homepage server-side so business analysis can be
 * grounded in what the page actually says, rather than guessed purely from
 * the domain name. Resolves the hostname first and refuses to fetch a
 * private/loopback address (DNS-rebinding-safe SSRF guard), separately from
 * the string-based hostname check `normalizeBrandUrl` already applies.
 * Returns null on any failure -- callers fall back to the domain-derived
 * brand name rather than treating this as fatal.
 */
export async function fetchHomepageText(url: URL, signal: AbortSignal): Promise<HomepageText | null> {
  try {
    const { address } = await dns.lookup(url.hostname);
    if (isPrivateIp(address)) return null;
  } catch {
    return null;
  }

  try {
    const res = await fetch(url.toString(), {
      signal,
      redirect: "follow",
      headers: { "User-Agent": "PartnraBot/1.0 (+https://partnra.ai)" },
    });
    if (!res.ok) return null;

    const contentLength = Number(res.headers.get("content-length") ?? "0");
    if (contentLength && contentLength > MAX_HOMEPAGE_BYTES) return null;

    const raw = (await res.text()).slice(0, MAX_HOMEPAGE_BYTES);

    const titleMatch = raw.match(/<title[^>]*>([^<]*)<\/title>/i);
    const descMatch =
      raw.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ??
      raw.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);

    const withoutNoise = raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ");
    const bodyText = decodeEntities(withoutNoise.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(
      0,
      MAX_BODY_TEXT_CHARS
    );

    return {
      title: titleMatch ? decodeEntities(titleMatch[1].trim()) : "",
      description: descMatch ? decodeEntities(descMatch[1].trim()) : "",
      bodyText,
    };
  } catch {
    return null;
  }
}

export interface BusinessProfile {
  category: string | null;
  market: string | null;
  keywords: string[];
  /** Real, well-known, specific brand names the model is confident are genuinely comparable -- never invented. */
  competitorNames: string[];
}

const TOOL_NAME = "report_business_profile";

const SCHEMA = {
  type: "object",
  properties: {
    category: { type: ["string", "null"] },
    market: { type: ["string", "null"] },
    keywords: { type: "array", items: { type: "string" }, maxItems: 5 },
    competitorNames: { type: "array", items: { type: "string" }, maxItems: 3 },
  },
  required: ["category", "keywords", "competitorNames"],
};

function buildSystemPrompt(): string {
  return `You are a conservative business analyst for Partnra, a partner-discovery tool.

You are given the real homepage content of a business. Identify:
1. Their product category, as a short specific phrase (e.g. "sports nutrition supplements").
2. Their primary market/geography if it's actually determinable from the content (e.g. "United States"); otherwise null. Never guess a market you can't support from the page.
3. Up to 5 short search keywords describing what they sell.
4. Up to 3 REAL, well-known, specific brand names that are genuinely comparable competitors in the same category.

Rules:
- Only name a competitor brand if you are confident it is a real, currently-operating company genuinely comparable to this business. If you are not confident, return fewer names or an empty list -- never invent or guess a brand name to fill the list.
- Do not include the business's own brand in competitorNames.
- Base category/market/keywords only on what the page content actually supports.`;
}

function buildUserPrompt(brand: string, domain: string, page: HomepageText | null): string {
  if (!page) {
    return `Business name (derived from domain, homepage could not be fetched): "${brand}" (${domain}).\nNo page content is available -- work only from the name if you can confidently infer the category; otherwise return nulls/empty lists.`;
  }
  return `Business: "${brand}" (${domain})\nHomepage title: ${page.title || "(none)"}\nMeta description: ${page.description || "(none)"}\nVisible page text (truncated): ${page.bodyText || "(none)"}`;
}

export async function identifyBusiness(
  brand: string,
  domain: string,
  page: HomepageText | null,
  signal: AbortSignal
): Promise<BusinessProfile> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new BusinessAnalysisError("ANTHROPIC_API_KEY is not configured");
  }

  const model = process.env.LLM_MODEL || "claude-haiku-4-5-20251001";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: buildUserPrompt(brand, domain, page) }],
      tools: [
        {
          name: TOOL_NAME,
          description: "Report the identified business profile.",
          input_schema: SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
    }),
    signal,
  });

  if (!res.ok) {
    throw new BusinessAnalysisError(`LLM business analysis returned ${res.status}`);
  }

  const data = (await res.json()) as { content?: Array<{ type: string; input?: unknown }> };
  const toolUse = data.content?.find((block) => block.type === "tool_use");
  const parsed = toolUse?.input as Record<string, unknown> | undefined;

  if (!parsed) {
    throw new BusinessAnalysisError("LLM business analysis returned an unexpected shape");
  }

  return {
    category: typeof parsed.category === "string" ? parsed.category : null,
    market: typeof parsed.market === "string" ? parsed.market : null,
    keywords: Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((k): k is string => typeof k === "string").slice(0, 5)
      : [],
    competitorNames: Array.isArray(parsed.competitorNames)
      ? parsed.competitorNames.filter((k): k is string => typeof k === "string").slice(0, 3)
      : [],
  };
}

export function isBusinessAnalysisConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
