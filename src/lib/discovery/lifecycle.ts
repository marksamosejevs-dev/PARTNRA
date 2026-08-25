/**
 * Architecture preparation for continuous discovery -- NOT wired to any
 * persistence layer yet. This project has no database, so nothing here is
 * currently read from or written to storage; a scan today is still a
 * one-off, stateless request exactly like before. These types exist so that
 * whenever a persistence layer is added, "was this partner already known,
 * or is it genuinely new?" has a clear, pre-agreed shape to slot into,
 * rather than being bolted on ad hoc later.
 *
 * Deliberately NOT a general relationship/partnership graph: just the
 * minimum fields that let a future scan tell new from already-known.
 */

/** Kept intentionally small -- Partnra is not a CRM. */
export type PartnerStatus = "Discovered" | "Saved" | "Contacted" | "Interested" | "Partner";

export type RelationshipType = "Creator" | "Affiliate" | "Publisher" | "Distributor" | "Retailer";

/**
 * The future persisted record for one (business, partner) relationship.
 * `firstSeen`/`lastSeen`/`lastChecked` are what let a later scan compute
 * "what's new since last time" honestly, instead of guessing or reshuffling
 * old results and presenting them as new.
 */
export interface TrackedPartner {
  businessDomain: string;
  partnerProfileUrl: string | null;
  partnerName: string | null;
  relationshipType: RelationshipType | null;
  evidence: string;
  source: string;
  status: PartnerStatus;
  /** ISO timestamp of the scan that first surfaced this relationship. */
  firstSeen: string;
  /** ISO timestamp of the most recent scan that still found this relationship. */
  lastSeen: string;
  /** ISO timestamp of the most recent scan that looked, whether or not it still found it. */
  lastChecked: string;
}

/**
 * Given what was known before and what a fresh scan just found, decides
 * what's genuinely new. Pure function, no I/O -- once a real persistence
 * layer exists, `previouslyKnown` would be loaded from storage rather than
 * passed in, but the comparison logic itself doesn't need to change.
 */
export function diffAgainstKnown(
  previouslyKnown: Pick<TrackedPartner, "partnerProfileUrl" | "partnerName">[],
  freshlyFound: Pick<TrackedPartner, "partnerProfileUrl" | "partnerName">[]
): { new: typeof freshlyFound; alreadyKnown: typeof freshlyFound } {
  const knownKeys = new Set(
    previouslyKnown.map((p) => (p.partnerProfileUrl ?? p.partnerName ?? "").toLowerCase()).filter(Boolean)
  );

  const isNew = freshlyFound.filter((p) => {
    const key = (p.partnerProfileUrl ?? p.partnerName ?? "").toLowerCase();
    return key && !knownKeys.has(key);
  });
  const alreadyKnown = freshlyFound.filter((p) => !isNew.includes(p));

  return { new: isNew, alreadyKnown };
}
