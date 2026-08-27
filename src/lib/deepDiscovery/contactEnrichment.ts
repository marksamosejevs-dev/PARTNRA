import { enrichContact, isHunterConfigured } from "../discovery/hunter";
import { withFallback } from "../discovery/timeout";
import { Candidate } from "../discovery/types";
import { EntityRow } from "../graph/types";

const ENRICH_TIMEOUT_MS = 5_000;

/**
 * Thin wrapper over Quick Scan's existing Hunter integration (Section 20)
 * -- reused as-is, not reimplemented, since it already encodes the real
 * rule this needs too ("only a genuine website/blog domain is eligible,
 * never a social profile URL"). Contact-enrichment failure or Hunter being
 * unconfigured must never remove an already-qualified Opportunity -- the
 * caller (worker.ts) always has a real Opportunity persisted before this
 * runs; this only ever adds a `public_contact`/`contact_page` value on
 * top, or leaves them null.
 */
export async function enrichEntityContact(entity: EntityRow): Promise<{ contact: string | null; contactPage: string | null }> {
  if (!isHunterConfigured() || !entity.domain) return { contact: null, contactPage: null };

  // enrichContact only reads `profileUrl` off the Candidate shape -- a
  // minimal stand-in built from the entity row, not a full Candidate.
  const pseudoCandidate = { profileUrl: `https://${entity.domain}` } as Candidate;
  const { contact, contactStatus } = await withFallback(
    (signal) => enrichContact(pseudoCandidate, signal),
    ENRICH_TIMEOUT_MS,
    `contact enrichment (${entity.domain})`,
    { contact: null, contactStatus: "not_attempted" as const }
  );

  // Never guess a "/contact" path as if it were confirmed -- only a real,
  // already-discovered contact_page (e.g. from applicationUrl during
  // brand expansion) is ever surfaced; no page's existence is assumed.
  return {
    contact: contactStatus === "found" ? contact : null,
    contactPage: entity.contact_page ?? null,
  };
}
