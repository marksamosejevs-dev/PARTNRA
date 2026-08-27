/**
 * Kept intentionally short — each entry is one billed search API call, and
 * coverage past ~6 targeted queries has sharply diminishing returns for an
 * MVP scan versus the cost of running it. This strategy is already
 * anchored to a specific named competitor, so category ambiguity ("pellets"
 * meaning two different things) is much less of a risk here than in the
 * category queries below -- but the LAST query slot still gets swapped for
 * a real commercial-intent concept (from this business's own Partner
 * Intent Profile, see business.ts) when one is available, so even
 * competitor-anchored discovery reflects this business's actual partner
 * types rather than always searching the same generic "ambassador review"
 * pattern regardless of business model.
 */
export function buildSearchQueries(brand: string, domain: string, commercialIntentConcepts: string[] = []): string[] {
  const base = [
    `"${brand}" "discount code"`,
    `"${brand}" "promo code"`,
    `"${brand}" affiliate`,
    `"${brand}" referral code`,
    `"${domain}" affiliate`,
  ];
  const conceptQuery = commercialIntentConcepts[0] ? `"${brand}" ${commercialIntentConcepts[0]}` : `"${brand}" ambassador review`;
  return [...base, conceptQuery];
}

/** YouTube Data API search.list calls are quota-metered per query — keep this list short. */
export function buildYoutubeQueries(brand: string, commercialIntentConcepts: string[] = []): string[] {
  const conceptQuery = commercialIntentConcepts[0] ? `${brand} ${commercialIntentConcepts[0]}` : `${brand} affiliate`;
  return [`${brand} discount code`, conceptQuery];
}

/**
 * Deliberately just 2 queries -- each is a billed OpenAI web-search call, and
 * this source already overlaps substantially with Serper's coverage. Kept
 * conservative per "prefer quality over quantity": phrased broadly enough to
 * pick up signals Serper's narrower exact-phrase queries can miss (partner
 * pages, "use my code" style call-outs, sponsored/ambassador language)
 * without duplicating the same 6 queries a second time.
 */
export function buildOpenAISearchQueries(brand: string, commercialIntentConcepts: string[] = []): string[] {
  const conceptQuery = commercialIntentConcepts[0]
    ? `"${brand}" ${commercialIntentConcepts[0]}`
    : `"${brand}" sponsored review OR ambassador OR newsletter recommendation`;
  return [`"${brand}" affiliate program OR partner program OR "use my code"`, conceptQuery];
}

/**
 * Category-based fallback: used when competitor-based discovery is
 * unavailable or too weak on its own. Searches for people/sites/companies
 * already commercially engaged with the product category itself -- not a
 * specific named competitor -- so a weak or absent competitor match never
 * dead-ends discovery. This is the strategy where a one-size-fits-all
 * "affiliate program"/"discount code" query pattern actively hurts result
 * quality (it assumes every business is DTC/affiliate-driven), so it
 * prefers `commercialIntentConcepts` -- this business's own dynamically
 * generated product+role+commercial-intent search concepts (see
 * business.ts's BusinessProfile) -- whenever the business analysis
 * actually produced any. Falls back to the old generic pattern only when
 * it didn't (AI unconfigured/failed, or genuinely returned none), so this
 * strategy never goes fully silent.
 */
export function buildCategoryQueries(category: string, keywords: string[], commercialIntentConcepts: string[] = []): string[] {
  if (commercialIntentConcepts.length > 0) {
    return commercialIntentConcepts.slice(0, 3);
  }
  const topic = keywords[0] || category;
  return [
    `"${category}" affiliate program`,
    `best ${category} recommended by`,
    `"${topic}" review "discount code"`,
  ];
}

/** YouTube Data API search.list calls are quota-metered per query — keep this list short. Same concept-first, generic-fallback contract as buildCategoryQueries. */
export function buildCategoryYoutubeQueries(category: string, keywords: string[], commercialIntentConcepts: string[] = []): string[] {
  if (commercialIntentConcepts.length > 0) {
    return commercialIntentConcepts.slice(0, 2);
  }
  const topic = keywords[0] || category;
  return [`best ${category}`, `${topic} review`];
}

/** Same cost-control reasoning as buildOpenAISearchQueries — kept to 2 queries. Same concept-first, generic-fallback contract as buildCategoryQueries. */
export function buildCategoryOpenAISearchQueries(category: string, keywords: string[], commercialIntentConcepts: string[] = []): string[] {
  if (commercialIntentConcepts.length > 0) {
    return commercialIntentConcepts.slice(0, 2);
  }
  const topic = keywords[0] || category;
  return [
    `"${category}" affiliate program OR partner program OR distributor`,
    `creators or publishers who regularly review "${topic}"`,
  ];
}
