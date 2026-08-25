import { Candidate, ClassifiedResult, SignalStrength } from "./types";

const STRENGTH_RANK: Record<SignalStrength, number> = { strong: 2, medium: 1, potential: 0 };

/**
 * The code-level backstop threshold, independent of what the classifier's
 * own prompt already enforces. Category-strategy evidence is inherently
 * softer (it's not tied to a named competitor), so it gets a lower bar --
 * still real evidence per classify.ts's own rules, just not held to the
 * same number as a direct competitor relationship.
 */
function minConfidenceFor(strength: SignalStrength): number {
  return strength === "strong" ? 70 : 60;
}

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
 * and sorts by signal strength first (a confirmed competitor relationship
 * always outranks a category-level signal, since their confidence numbers
 * aren't on the same scale), then confidence, then source count so a
 * candidate corroborated by multiple independent sources ranks above an
 * equally-confident single-source one -- without inflating the confidence
 * number itself.
 */
export function dedupeCandidates(items: ClassifiedResult[]): Candidate[] {
  const merged: Candidate[] = [];

  for (const item of items) {
    if (!item.validCandidate || item.confidence < minConfidenceFor(item.signalStrength)) continue;

    const candidate: Candidate = {
      name: item.name,
      type: item.type,
      platform: item.platform,
      profileUrl: item.profileUrl,
      sourceUrl: item.sourceUrl,
      sourceCount: 1,
      evidenceType: item.evidenceType,
      evidence: item.evidence,
      signalStrength: item.signalStrength,
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
    // Strength first (a confirmed competitor relationship always outranks a
    // category-level signal, whatever the raw confidence numbers say -- the
    // two scales aren't comparable), confidence only as the tiebreaker.
    const existingRank = STRENGTH_RANK[existing.signalStrength];
    const candidateRank = STRENGTH_RANK[candidate.signalStrength];
    const [primary, secondary] =
      candidateRank !== existingRank
        ? candidateRank > existingRank ? [candidate, existing] : [existing, candidate]
        : candidate.confidence >= existing.confidence
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

  return merged.sort(
    (a, b) =>
      STRENGTH_RANK[b.signalStrength] - STRENGTH_RANK[a.signalStrength] ||
      b.confidence - a.confidence ||
      b.sourceCount - a.sourceCount
  );
}
