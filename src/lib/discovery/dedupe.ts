import { Candidate, ClassifiedResult, SignalStrength } from "./types";
import { computeFitScore } from "./entity";
import { flagDuplicateEvidenceNetworks } from "./duplicateNetwork";

const STRENGTH_RANK: Record<SignalStrength, number> = { strong: 2, medium: 1, potential: 0 };

/**
 * The code-level backstop threshold, independent of what the classifier's
 * own prompt already enforces. Category-strategy evidence is inherently
 * softer (it's not tied to a named competitor), so it gets a lower bar --
 * still real evidence per classify.ts's own rules, just not held to the
 * same number as a direct competitor relationship. Unverified (deterministic
 * fallback, see classify.ts's scoreUnverified) results have no threshold at
 * all here -- their confidence number is only ever a same-tier sort key
 * among themselves, never a pass/fail gate, since by definition no model
 * has judged them; they're kept, just always ranked below every verified
 * result.
 */
export function minConfidenceFor(strength: SignalStrength, verified: boolean): number {
  if (!verified) return 0;
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
    if (!item.validCandidate || item.confidence < minConfidenceFor(item.signalStrength, item.verified)) continue;

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
      verified: item.verified,
      promoCode: item.promoCode,
      contact: null,
      contactStatus: "not_attempted",
      evidenceConfidence: item.evidenceConfidence,
      confidence: item.confidence,
      fitScore: item.fitScore, // recomputed below once sourceCount/applicationUrl are final
      applicationUrl: item.applicationUrl,
      // Real values only assigned once the full pool is assembled, below --
      // see flagDuplicateEvidenceNetworks.
      similarEvidenceNetwork: false,
      similarEvidenceDomainCount: 0,
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
    // two scales aren't comparable), then AI-verified over unverified at the
    // same strength (a model actually judged one of them), confidence only
    // as the final tiebreaker.
    const existingRank = STRENGTH_RANK[existing.signalStrength];
    const candidateRank = STRENGTH_RANK[candidate.signalStrength];
    const [primary, secondary] =
      candidateRank !== existingRank
        ? candidateRank > existingRank ? [candidate, existing] : [existing, candidate]
        : candidate.verified !== existing.verified
          ? candidate.verified ? [candidate, existing] : [existing, candidate]
          : candidate.confidence >= existing.confidence
            ? [candidate, existing]
            : [existing, candidate];

    merged[existingIndex] = {
      ...primary,
      platform: mergePlatforms(primary.platform, secondary.platform),
      evidence: primary.evidence === secondary.evidence
        ? primary.evidence
        : `${primary.evidence} ${secondary.evidence}`.trim(),
      // A real affiliate/apply page found on either sighting is worth
      // keeping even if the primary (higher-ranked) sighting didn't have one.
      applicationUrl: primary.applicationUrl ?? secondary.applicationUrl,
      sourceCount: existing.sourceCount + 1,
    };
  }

  // fitScore depends on the FINAL sourceCount and applicationUrl, both of
  // which only settle once merging above is done -- recomputed here rather
  // than trusting the per-item placeholder from classify.ts.
  const withFinalFit = merged.map((c) => ({
    ...c,
    fitScore: computeFitScore({
      signalStrength: c.signalStrength,
      verified: c.verified,
      type: c.type,
      sourceCount: c.sourceCount,
      hasApplicationRoute: !!c.applicationUrl,
    }),
  }));

  // Cross-domain templated/doorway-network detection needs the full
  // deduplicated (one row per real entity) list to compare against -- runs
  // last, right before the ranking sort, so a down-ranked cluster member's
  // discounted fitScore is what the sort actually orders by.
  const withNetworkFlags = flagDuplicateEvidenceNetworks(withFinalFit);

  return withNetworkFlags.sort(
    (a, b) =>
      STRENGTH_RANK[b.signalStrength] - STRENGTH_RANK[a.signalStrength] ||
      Number(b.verified) - Number(a.verified) ||
      b.fitScore - a.fitScore ||
      b.confidence - a.confidence ||
      b.sourceCount - a.sourceCount
  );
}
