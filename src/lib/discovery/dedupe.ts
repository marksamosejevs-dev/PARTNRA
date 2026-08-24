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

/**
 * Drops invalid/low-confidence classifications, merges repeat sightings of
 * the same affiliate (same profile URL, promo code, or name) into one
 * candidate, and sorts by confidence.
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
      evidenceType: item.evidenceType,
      evidence: item.evidence,
      promoCode: item.promoCode,
      contact: item.contact,
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
      evidence: primary.evidence === secondary.evidence
        ? primary.evidence
        : `${primary.evidence} ${secondary.evidence}`.trim(),
    };
  }

  return merged.sort((a, b) => b.confidence - a.confidence);
}
