import { Candidate } from "./types";

/**
 * Only ever served when PARTNRA_MOCK_MODE=true. The API response always
 * carries mock: true so the frontend can label this clearly instead of
 * presenting it as a real scan.
 */
export function getMockCandidates(brand: string): Candidate[] {
  return [
    {
      name: "James Reed",
      type: "Creator",
      platform: "YouTube",
      profileUrl: "https://youtube.com/@jamesreed",
      sourceUrl: "https://youtube.com/watch?v=example1",
      evidenceType: "Promo code",
      evidence: `Uses code JAMES15 when recommending ${brand} in a product review video.`,
      promoCode: "JAMES15",
      contact: null,
      confidence: 92,
      reason: "Named creator with a personalized discount code tied to the brand.",
    },
    {
      name: "The Honest Review Blog",
      type: "Publisher",
      platform: "Blog",
      profileUrl: "https://honestreviewblog.example.com",
      sourceUrl: "https://honestreviewblog.example.com/best-picks",
      evidenceType: "Affiliate link",
      evidence: `"Best picks" roundup post links to ${brand} through a tagged affiliate URL.`,
      promoCode: null,
      contact: null,
      confidence: 81,
      reason: "Outbound link carries an affiliate tracking parameter.",
    },
    {
      name: "Sarah Whitmore",
      type: "Creator",
      platform: "Instagram",
      profileUrl: "https://instagram.com/sarahwhitmore",
      sourceUrl: "https://instagram.com/p/example2",
      evidenceType: "Ambassador",
      evidence: `Bio links to a dedicated ${brand} discount landing page and discloses a paid partnership.`,
      promoCode: null,
      contact: null,
      confidence: 76,
      reason: "Disclosed partnership plus a dedicated discount page.",
    },
  ];
}
