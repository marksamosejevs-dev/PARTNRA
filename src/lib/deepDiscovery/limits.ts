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
  /**
   * A candidate that overflowed the per-brand AI-classification budget (see
   * classify.ts's sampleAcrossSources) is only worth a follow-up
   * relationship_verification job if its deterministic (unverified) fitScore
   * already clears the "good" floor (see qualification.ts's
   * qualityTierForFit) -- i.e. it would ALREADY be good/strong today if only
   * it had been verified. A candidate that scores poorly even ignoring
   * verification isn't worth spending a second AI call on.
   */
  overflowVerificationMinFit: 50,
  /** Bounds total relationship_verification jobs a single scan can enqueue -- cost stays predictable regardless of how many candidates overflow. */
  maxRelationshipVerificationsPerScan: 20,
  /** Bounds how many of one entity's unverified relationships a single relationship_verification job re-checks -- an entity rarely has more than a handful within one scan, but this keeps a single job's own cost/duration bounded regardless. */
  maxRelationshipsPerVerificationJob: 5,
  /** One bounded worker tick (see netlify/functions/deep-discovery-worker.ts) processes at most this many jobs before returning, so a single invocation can't run indefinitely. */
  maxJobsPerWorkerTick: 8,
  maxJobAttempts: 3,
  /**
   * A 'running' discovery_jobs row older than this is assumed orphaned
   * (the process that claimed it died -- a Netlify function limit, a
   * crash, an unbounded hang) and is reclaimed by reclaim_stale_jobs()
   * (see supabase/migrations/0005_stale_job_recovery.sql). Chosen well
   * above any legitimate job's real duration -- every external
   * search/classify call is individually bounded to well under a minute
   * (see discovery/timeout.ts), and every Supabase call now carries its
   * own SUPABASE_FETCH_TIMEOUT_MS hard timeout (see graph/client.ts) -- so
   * a genuinely still-running job essentially never crosses this. It's
   * also well short of "hours": since the worker cron fires every minute,
   * a truly orphaned job recovers automatically within one lease window of
   * dying, never requiring manual intervention.
   */
  staleJobLeaseSeconds: 300,
} as const;
