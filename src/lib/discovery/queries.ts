/**
 * Kept intentionally short — each entry is one billed search API call, and
 * coverage past ~6 targeted queries has sharply diminishing returns for an
 * MVP scan versus the cost of running it.
 */
export function buildSearchQueries(brand: string, domain: string): string[] {
  return [
    `"${brand}" "discount code"`,
    `"${brand}" "promo code"`,
    `"${brand}" affiliate`,
    `"${brand}" referral code`,
    `"${domain}" affiliate`,
    `"${brand}" ambassador review`,
  ];
}

/** YouTube Data API search.list calls are quota-metered per query — keep this list short. */
export function buildYoutubeQueries(brand: string): string[] {
  return [`${brand} discount code`, `${brand} affiliate`];
}

/**
 * Deliberately just 2 queries -- each is a billed OpenAI web-search call, and
 * this source already overlaps substantially with Serper's coverage. Kept
 * conservative per "prefer quality over quantity": phrased broadly enough to
 * pick up signals Serper's narrower exact-phrase queries can miss (partner
 * pages, "use my code" style call-outs, sponsored/ambassador language)
 * without duplicating the same 6 queries a second time.
 */
export function buildOpenAISearchQueries(brand: string): string[] {
  return [
    `"${brand}" affiliate program OR partner program OR "use my code"`,
    `"${brand}" sponsored review OR ambassador OR newsletter recommendation`,
  ];
}
