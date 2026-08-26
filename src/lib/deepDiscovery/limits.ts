/**
 * Cost-control limits for Deep Discovery (Section 35). All configurable in
 * one place so a real deployed run's cost is bounded and auditable --
 * never an uncontrolled crawl. These are deliberately modest defaults for
 * V1; raise them once real provider-usage numbers from a live deployment
 * justify it.
 */
export const DEEP_DISCOVERY_LIMITS = {
  /** Five excellent comparable brands beat twenty weak ones -- this is a CEILING, never a target to force. */
  maxComparableBrands: 15,
  /** How many AI-suggested extra brand names get sent to live-search resolution per scan -- resolution itself (see competitors.ts) still drops anything that doesn't resolve to a real domain. */
  maxBrandExpansionCandidates: 20,
  maxEntityExpansionsPerScan: 12,
  maxSearchResultsPerBrand: 30,
  maxEntitiesSentToAiVerificationPerBrand: 15,
  maxContactEnrichmentsPerScan: 20,
  /** One bounded worker tick (see netlify/functions/deep-discovery-worker.ts) processes at most this many jobs before returning, so a single invocation can't run indefinitely. */
  maxJobsPerWorkerTick: 8,
  maxJobAttempts: 3,
} as const;
