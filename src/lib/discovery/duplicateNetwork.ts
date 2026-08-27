import { Candidate } from "./types";

/**
 * Detects templated/doorway affiliate networks -- distinct domains that
 * are really the same SEO template stamped out multiple times (e.g.
 * peptides131.com, peptides139.com) -- so they don't all independently
 * occupy top-ranked positions as if each were a separately vetted partner.
 * This never merges across domains (see dedupe.ts's isSameAffiliate for
 * that; a name/profileUrl match there is a different, same-entity case):
 * every flagged candidate stays its own row, just down-ranked and labeled,
 * because we genuinely don't know which (if any) of a cloned cluster is a
 * real, distinct business versus a mirror -- preserving all of them,
 * penalizing all of them, is the honest default absent independent
 * evidence that singles one out.
 */

function normalizeForSimilarity(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const word of setA) if (setB.has(word)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function hostnameOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * A brand-ish word followed by a bare number as the entire domain label
 * (peptides131.com, peptides139.com, deal47.net) is a classic doorway/
 * templated-SEO-network tell -- distinct registrations of the same
 * generator, not distinct businesses -- detected from the domain alone,
 * independent of how similar the page copy itself turns out to be.
 */
function numericSuffixDomainBase(hostname: string): string | null {
  const label = hostname.split(".")[0];
  const match = label.match(/^([a-z]{3,})(\d{1,5})$/i);
  return match ? match[1].toLowerCase() : null;
}

const EVIDENCE_SIMILARITY_THRESHOLD = 0.55;

export function flagDuplicateEvidenceNetworks(candidates: Candidate[]): Candidate[] {
  const n = candidates.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x: number): number {
    return parent[x] === x ? x : (parent[x] = find(parent[x]));
  }
  function union(a: number, b: number): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootA] = rootB;
  }

  const tokens = candidates.map((c) => normalizeForSimilarity(`${c.evidence} ${c.reason}`));
  const hostnames = candidates.map((c) => hostnameOf(c.profileUrl) ?? hostnameOf(c.sourceUrl));
  const numericBases = hostnames.map((h) => (h ? numericSuffixDomainBase(h) : null));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Same domain is normal same-entity dedup's job (see dedupe.ts), not
      // a cross-domain templated-network signal -- skip it here.
      if (hostnames[i] && hostnames[j] && hostnames[i] === hostnames[j]) continue;

      const sharesNumericSuffixBase = !!numericBases[i] && numericBases[i] === numericBases[j];
      const hasSimilarEvidenceText = jaccardSimilarity(tokens[i], tokens[j]) >= EVIDENCE_SIMILARITY_THRESHOLD;
      if (sharesNumericSuffixBase || hasSimilarEvidenceText) union(i, j);
    }
  }

  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const members = clusters.get(root) ?? [];
    members.push(i);
    clusters.set(root, members);
  }

  const result = candidates.map((c) => ({ ...c }));
  for (const members of clusters.values()) {
    if (members.length < 2) continue;
    const extraMembers = members.length - 1;
    for (const idx of members) {
      const c = result[idx];
      // AI-verified evidence is inherently more trustworthy than a
      // deterministic keyword-fallback score -- template reuse can fool a
      // classifier too, so it still gets flagged, just discounted less
      // steeply than an unverified fallback score would be.
      const perMemberPenalty = c.verified ? 6 : 12;
      const penalty = Math.min(extraMembers * perMemberPenalty, 30);
      result[idx] = {
        ...c,
        similarEvidenceNetwork: true,
        similarEvidenceDomainCount: members.length,
        fitScore: Math.max(0, c.fitScore - penalty),
      };
    }
  }
  return result;
}
