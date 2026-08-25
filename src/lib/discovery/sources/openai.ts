import { SourceItem } from "../types";
import { buildOpenAISearchQueries, buildCategoryOpenAISearchQueries } from "../queries";

export class OpenAIProviderError extends Error {}

/**
 * Uses the OpenAI Responses API's built-in `web_search` tool. When the model
 * cites a page it searched, the Responses API attaches a `url_citation`
 * annotation (with the real page URL) to the relevant span of output text --
 * that annotation is the ONLY thing this module treats as evidence. Plain
 * model commentary with no citation attached is discarded rather than
 * surfaced as a source, since we can't verify it points at a real page.
 */
const MODEL = "gpt-4.1-mini";

interface ResponsesApiAnnotation {
  type?: string;
  url?: string;
  title?: string;
}

interface ResponsesApiContentPart {
  type?: string;
  text?: string;
  annotations?: ResponsesApiAnnotation[];
}

interface ResponsesApiOutputItem {
  type?: string;
  content?: ResponsesApiContentPart[];
}

interface ResponsesApiResponse {
  output?: ResponsesApiOutputItem[];
}

async function searchOpenAI(query: string, apiKey: string, signal: AbortSignal): Promise<SourceItem[]> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input: query,
      tools: [{ type: "web_search" }],
    }),
    signal,
  });

  if (!res.ok) {
    throw new OpenAIProviderError(`OpenAI Responses API returned ${res.status}`);
  }

  const data = (await res.json()) as ResponsesApiResponse;
  const items: SourceItem[] = [];
  const seenUrls = new Set<string>();

  for (const outputItem of data.output ?? []) {
    for (const part of outputItem.content ?? []) {
      const text = typeof part.text === "string" ? part.text : "";
      for (const annotation of part.annotations ?? []) {
        if (annotation.type !== "url_citation") continue;
        if (typeof annotation.url !== "string" || !annotation.url) continue;
        if (seenUrls.has(annotation.url)) continue;
        seenUrls.add(annotation.url);
        items.push({
          source: "OpenAI",
          platform: "Web",
          title: typeof annotation.title === "string" ? annotation.title : "",
          url: annotation.url,
          profileUrl: null,
          snippet: text.slice(0, 300),
        });
      }
    }
  }

  return items;
}

export function isOpenAISearchConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/** Optional source — unconfigured or failing is not fatal to the scan. */
export async function discoverFromOpenAI(brand: string, signal: AbortSignal): Promise<SourceItem[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  try {
    const queries = buildOpenAISearchQueries(brand);
    const batches = await Promise.all(queries.map((q) => searchOpenAI(q, apiKey, signal)));
    return batches.flat();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return [];
  }
}

/** Category-based fallback source — same optional, never-fatal contract as discoverFromOpenAI. */
export async function discoverCategoryFromOpenAI(
  category: string,
  keywords: string[],
  signal: AbortSignal
): Promise<SourceItem[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  try {
    const queries = buildCategoryOpenAISearchQueries(category, keywords);
    const batches = await Promise.all(queries.map((q) => searchOpenAI(q, apiKey, signal)));
    return batches.flat();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return [];
  }
}

/**
 * Business-understanding fallback for when a business's own homepage can't
 * be fetched/parsed directly (JS-rendered shell, anti-bot page, blocked
 * response, etc.) -- asks the model to answer from real web search results
 * about the domain/brand rather than the (unreachable) page itself. Plain
 * text answer, not source-item evidence: this exists to ground business
 * analysis, not to surface partner evidence. Same optional, never-fatal
 * contract as the other OpenAI sources -- returns null if unconfigured or
 * on any failure.
 */
export async function fetchBusinessContextFromOpenAI(
  brand: string,
  domain: string,
  signal: AbortSignal
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        input: `Using real web search, what does the company at the domain "${domain}" (also known as "${brand}") actually sell? Answer in one or two factual sentences based only on what you can actually find indexed about this specific company. If you cannot find real, specific information about it, say plainly that you found nothing rather than guessing or describing a generic/different company.`,
        tools: [{ type: "web_search" }],
      }),
      signal,
    });
    if (!res.ok) return null;

    const data = (await res.json()) as ResponsesApiResponse;
    const text = (data.output ?? [])
      .flatMap((item) => item.content ?? [])
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join(" ")
      .trim();

    return text || null;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return null;
  }
}
