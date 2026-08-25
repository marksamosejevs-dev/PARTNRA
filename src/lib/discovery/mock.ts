import { Candidate } from "./types";

/**
 * Only ever served when PARTNRA_MOCK_MODE=true. The API response always
 * carries mock: true so the frontend can label this clearly instead of
 * presenting it as a real scan. Deliberately showcases a multi-source
 * candidate and a found contact so local demos exercise those code paths too.
 */
export function getMockCandidates(brand: string): Candidate[] {
  return [
    {
      name: "James Reed",
      type: "Creator",
      platform: "YouTube, Instagram",
      profileUrl: "https://youtube.com/@jamesreed",
      sourceUrl: "https://youtube.com/watch?v=example1",
      sourceCount: 2,
      evidenceType: "Promo code",
      evidence: `Uses code JAMES15 when recommending ${brand} in a product review video. Also posts the same code in an Instagram Reel caption.`,
      signalStrength: "strong",
      verified: true,
      promoCode: "JAMES15",
      contact: "james@creatorpartnerships.example",
      contactStatus: "found",
      confidence: 92,
      reason: "Named creator with a personalized discount code tied to the brand, corroborated across two platforms.",
    },
    {
      name: "The Honest Review Blog",
      type: "Publisher",
      platform: "Web",
      profileUrl: "https://honestreviewblog.example.com",
      sourceUrl: "https://honestreviewblog.example.com/best-picks",
      sourceCount: 1,
      evidenceType: "Affiliate link",
      evidence: `"Best picks" roundup post links to ${brand} through a tagged affiliate URL.`,
      signalStrength: "strong",
      verified: true,
      promoCode: null,
      contact: null,
      contactStatus: "not_found",
      confidence: 81,
      reason: "Outbound link carries an affiliate tracking parameter.",
    },
    {
      name: "Sarah Whitmore",
      type: "Creator",
      platform: "TikTok",
      profileUrl: "https://www.tiktok.com/@sarahwhitmore",
      sourceUrl: "https://www.tiktok.com/@sarahwhitmore/video/example2",
      sourceCount: 1,
      evidenceType: "Ambassador",
      evidence: `Bio links to a dedicated ${brand} discount landing page and discloses a paid partnership.`,
      signalStrength: "strong",
      verified: true,
      promoCode: null,
      contact: null,
      contactStatus: "not_attempted",
      confidence: 76,
      reason: "Disclosed partnership plus a dedicated discount page.",
    },
  ];
}
