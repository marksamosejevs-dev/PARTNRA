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
