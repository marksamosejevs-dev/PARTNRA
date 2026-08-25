import { promises as dns } from "dns";
import { raceValueWithTimeout, StageTimeoutError } from "./timeout";
import { ScanLogger } from "./scanLogger";
import { fetchBusinessContextFromOpenAI } from "./sources/openai";

export class BusinessAnalysisError extends Error {}

// Node's dns.lookup has no AbortSignal support, so it can hang far past any
// of the bounded stage timeouts around it -- bound it explicitly instead.
const DNS_LOOKUP_TIMEOUT_MS = 3_000;

const MAX_HOMEPAGE_BYTES = 2_000_000;
const MAX_BODY_TEXT_CHARS = 4000;

// A page can return 200 with real HTML and still be useless for business
// analysis -- a JS-rendered shell (`<div id="app"></div>`), an anti-bot
// interstitial, or a near-empty redirect stub all "succeed" as a fetch
// while leaving nothing to analyse. Below this many readable characters
// (title/description alone can still count, see isUsableContent), treat it
// the same as a fetch failure and fall back to search instead of guessing
// from a near-empty page.
const MIN_USABLE_BODY_TEXT_CHARS = 60;

function isUsableContent(title: string, description: string, bodyText: string): boolean {
  return title.length > 0 || description.length > 0 || bodyText.length >= MIN_USABLE_BODY_TEXT_CHARS;
}

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
 * Returns null on any failure -- callers fall back to a web-search-based
 * understanding instead (see fetchBusinessContextFromWeb) rather than
 * treating this as fatal. `log`, if given, records exactly which stage
 * failed and why -- normalized URL, HTTP status, redirect target, error
 * type/message, elapsed time -- since "fetched: false" alone doesn't say
 * whether that was DNS, a private-IP block, a non-2xx response, an
 * oversized body, or the fetch itself throwing.
 */
export async function fetchHomepageText(
  url: URL,
  signal: AbortSignal,
  log?: ScanLogger
): Promise<HomepageText | null> {
  const start = Date.now();
  const normalizedUrl = url.toString();

  let address: string;
  try {
    const dnsResult = await raceValueWithTimeout(
      dns.lookup(url.hostname),
      DNS_LOOKUP_TIMEOUT_MS,
      "homepage DNS lookup"
    );
    address = dnsResult.address;
  } catch (err) {
    log?.fail("homepage_fetch_detail", err, {
      normalizedUrl,
      stage: err instanceof StageTimeoutError ? "dns_lookup_timeout" : "dns_lookup_failed",
      elapsedMs: Date.now() - start,
    });
    return null;
  }

  if (isPrivateIp(address)) {
    log?.mark("homepage_fetch_detail", {
      normalizedUrl,
      stage: "private_ip_blocked",
      elapsedMs: Date.now() - start,
    });
    return null;
  }

  try {
    const res = await fetch(url.toString(), {
      signal,
      redirect: "follow",
      headers: { "User-Agent": "PartnraBot/1.0 (+https://partnra.ai)" },
    });
    const finalUrl = res.url || normalizedUrl;
    const contentType = res.headers.get("content-type") ?? "";
    const baseDetail = {
      normalizedUrl,
      finalUrl,
      redirected: res.redirected,
      httpStatus: res.status,
      contentType,
    };

    if (!res.ok) {
      log?.mark("homepage_fetch_detail", { ...baseDetail, stage: "http_error", elapsedMs: Date.now() - start });
      return null;
    }

    const contentLength = Number(res.headers.get("content-length") ?? "0");
    if (contentLength && contentLength > MAX_HOMEPAGE_BYTES) {
      log?.mark("homepage_fetch_detail", {
        ...baseDetail,
        stage: "content_too_large",
        contentLength,
        elapsedMs: Date.now() - start,
      });
      return null;
    }

    if (contentType && !contentType.toLowerCase().includes("html")) {
      log?.mark("homepage_fetch_detail", {
        ...baseDetail,
        stage: "unsupported_content_type",
        elapsedMs: Date.now() - start,
      });
      return null;
    }

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
    const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : "";
    const description = descMatch ? decodeEntities(descMatch[1].trim()) : "";

    // A 200 response with real HTML can still be a JS-rendered shell or an
    // anti-bot interstitial with nothing readable in it -- that's not a
    // fetch failure, but it's just as useless for business analysis, so it
    // gets the same "fall back to search" treatment as one.
    if (!isUsableContent(title, description, bodyText)) {
      log?.mark("homepage_fetch_detail", {
        ...baseDetail,
        stage: "insufficient_content",
        responseChars: raw.length,
        bodyTextChars: bodyText.length,
        elapsedMs: Date.now() - start,
      });
      return null;
    }

    log?.mark("homepage_fetch_detail", {
      ...baseDetail,
      stage: "ok",
      responseChars: raw.length,
      bodyTextChars: bodyText.length,
      elapsedMs: Date.now() - start,
    });

    return { title, description, bodyText };
  } catch (err) {
    log?.fail("homepage_fetch_detail", err, {
      normalizedUrl,
      stage: err instanceof DOMException && err.name === "AbortError" ? "aborted" : "fetch_error",
      elapsedMs: Date.now() - start,
    });
    return null;
  }
}

/**
 * Fallback business-understanding path for when the homepage itself
 * couldn't be fetched directly (blocked by bot protection, a non-2xx
 * response, DNS trouble, etc.) -- searches the public web for the
 * domain/brand instead, so business analysis still has *something* real to
 * ground itself in rather than only the bare domain name. Never fabricates:
 * only real search-result titles/snippets are returned, and the caller
 * (identifyBusiness) is instructed to use them only as far as they actually
 * support a conclusion. Optional and never fatal -- returns null on any
 * failure or if unconfigured, same contract as the other optional sources.
 */
async function searchSerperForBusinessContext(
  query: string,
  apiKey: string,
  signal: AbortSignal
): Promise<string[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({ q: query, num: 5 }),
    signal,
  });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    organic?: Array<{ title?: string; snippet?: string }>;
  };
  const organic = Array.isArray(data.organic) ? data.organic : [];

  return organic
    .slice(0, 5)
    .map((r) => `- ${(r.title ?? "").trim()}: ${(r.snippet ?? "").trim()}`)
    .filter((line) => line.length > 3);
}

async function fetchSerperBusinessContext(brand: string, domain: string, signal: AbortSignal): Promise<string | null> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return null;

  try {
    // Two angles: an exact brand+domain lookup, and a broader "what does
    // this domain actually do" query -- the second one is what tends to
    // surface real content for a domain whose own site is JS-heavy or
    // behind bot protection, since review/news/directory pages that
    // describe it are usually plain HTML and well indexed even when the
    // business's own site isn't directly parseable.
    const queries = [`"${brand}" ${domain}`, `${domain} (about OR products OR services OR company)`];
    const batches = await Promise.all(queries.map((q) => searchSerperForBusinessContext(q, apiKey, signal)));
    const snippets = Array.from(new Set(batches.flat()));
    return snippets.length > 0 ? snippets.join("\n") : null;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return null;
  }
}

/**
 * Fallback business-understanding path for when the homepage itself
 * couldn't be fetched/parsed directly (blocked by bot protection, a
 * JS-rendered shell, a non-2xx response, DNS trouble, etc.) -- searches the
 * public web for the domain/brand via Serper and OpenAI Web Search instead,
 * so business analysis still has *something* real to ground itself in
 * rather than only the bare domain name. This is exactly the case for a
 * JS-heavy or anti-bot-protected site: its own homepage may not be directly
 * parseable, but real, publicly indexed pages describing it (news,
 * reviews, directories) usually still are. Never fabricates: only real
 * search-result snippets/answers are returned, and the caller
 * (identifyBusiness) is instructed to use them only as far as they actually
 * support a conclusion. Optional and never fatal -- returns null if both
 * are unconfigured or fail, same contract as the other optional sources.
 */
export async function fetchBusinessContextFromWeb(
  brand: string,
  domain: string,
  signal: AbortSignal
): Promise<string | null> {
  const [serperContext, openaiContext] = await Promise.all([
    fetchSerperBusinessContext(brand, domain, signal),
    fetchBusinessContextFromOpenAI(brand, domain, signal),
  ]);

  const parts = [
    serperContext ? `Web search results:\n${serperContext}` : null,
    openaiContext ? `OpenAI web search answer: ${openaiContext}` : null,
  ].filter((p): p is string => p !== null);

  return parts.length > 0 ? parts.join("\n\n") : null;
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

You are given either the real homepage content of a business, or (when the homepage itself couldn't be fetched directly) public web search results about it. Identify:
1. Their product category, as a short specific phrase (e.g. "sports nutrition supplements").
2. Their primary market/geography if it's actually determinable from the content (e.g. "United States"); otherwise null. Never guess a market you can't support from the page.
3. Up to 5 short search keywords describing what they sell.
4. Up to 3 REAL, well-known, specific brand names that are genuinely comparable competitors in the same category.

Rules:
- Only name a competitor brand if you are confident it is a real, currently-operating company genuinely comparable to this business. If you are not confident, return fewer names or an empty list -- never invent or guess a brand name to fill the list.
- Do not include the business's own brand in competitorNames.
- Base category/market/keywords only on what the provided content actually supports -- whether that's the homepage text or the search snippets.`;
}

function buildUserPrompt(
  brand: string,
  domain: string,
  page: HomepageText | null,
  searchContext: string | null
): string {
  if (page) {
    return `Business: "${brand}" (${domain})\nHomepage title: ${page.title || "(none)"}\nMeta description: ${page.description || "(none)"}\nVisible page text (truncated): ${page.bodyText || "(none)"}`;
  }
  if (searchContext) {
    return `Business name (derived from domain, homepage could not be fetched directly): "${brand}" (${domain}).\nPublic web search results about this business (title/snippet pairs -- not necessarily from their own site):\n${searchContext}\n\nUse only what these snippets actually support; if they don't clearly describe what this business sells, return nulls/empty lists rather than guessing.`;
  }
  return `Business name (derived from domain, homepage could not be fetched, and no other public information was found): "${brand}" (${domain}).\nWork only from the name if you can confidently infer the category; otherwise return nulls/empty lists.`;
}

export async function identifyBusiness(
  brand: string,
  domain: string,
  page: HomepageText | null,
  searchContext: string | null,
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
      messages: [{ role: "user", content: buildUserPrompt(brand, domain, page, searchContext) }],
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
