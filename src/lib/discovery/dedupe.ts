import { Candidate, ClassifiedResult } from "./types";

function norm(value: string | null): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function isSameAffiliate(a: Candidate, b: Candidate): boolean {
  const aProfile = norm(a.profileUrl);
  const bProfile = norm(b.profileUrl);
  if (aProfile && bProfile && aProfile === bProfile) return true;

  const aCode = norm(a.promoCode);
  const bCode = norm(b.promoCode);
  if (aCode && bCode && aCode === bCode) return true;

  const aName = norm(a.name);
  const bName = norm(b.name);
  if (aName && bName && aName === bName) return true;

  return false;
}

function mergePlatforms(a: string | null, b: string | null): string | null {
  const set = new Set(
    [a, b]
      .filter((p): p is string => !!p)
      .flatMap((p) => p.split(",").map((s) => s.trim()))
      .filter(Boolean)
  );
  return set.size ? Array.from(set).join(", ") : null;
}

/**
 * Drops invalid/low-confidence classifications, merges repeat sightings of
 * the same affiliate found across sources (same profile URL, promo code, or
 * name) into one candidate with a combined platform list and source count,
 * and sorts by confidence, then by source count so a candidate corroborated
 * by multiple independent sources ranks above an equally-confident
 * single-source one -- without inflating the confidence number itself.
 */
export function dedupeCandidates(items: ClassifiedResult[]): Candidate[] {
  const merged: Candidate[] = [];

  for (const item of items) {
    if (!item.validCandidate || item.confidence < 70) continue;

    const candidate: Candidate = {
      name: item.name,
      type: item.type,
      platform: item.platform,
      profileUrl: item.profileUrl,
      sourceUrl: item.sourceUrl,
      sourceCount: 1,
      evidenceType: item.evidenceType,
      evidence: item.evidence,
      promoCode: item.promoCode,
      contact: null,
      contactStatus: "not_attempted",
      confidence: item.confidence,
      reason: item.reason,
    };

    const existingIndex = merged.findIndex((m) => isSameAffiliate(m, candidate));
    if (existingIndex === -1) {
      merged.push(candidate);
      continue;
    }

    const existing = merged[existingIndex];
    const [primary, secondary] = candidate.confidence >= existing.confidence
      ? [candidate, existing]
      : [existing, candidate];

    merged[existingIndex] = {
      ...primary,
      platform: mergePlatforms(primary.platform, secondary.platform),
      evidence: primary.evidence === secondary.evidence
        ? primary.evidence
        : `${primary.evidence} ${secondary.evidence}`.trim(),
      sourceCount: existing.sourceCount + 1,
    };
  }

  return merged.sort((a, b) => b.confidence - a.confidence || b.sourceCount - a.sourceCount);
}
