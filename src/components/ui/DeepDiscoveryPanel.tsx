"use client";

import { useEffect, useRef, useState } from "react";
import { Arrow } from "./Arrow";

/**
 * Section 42-44's minimal UI addition -- a CTA plus a real, persisted-
 * progress panel, deliberately reusing the existing visual language
 * (same rounded-2xl/border/bg-surface classes DiscoveryScanner already
 * uses elsewhere) rather than introducing new page structure. Polling
 * here is a UX convenience only, never the actual persistence mechanism
 * -- the underlying scan keeps advancing via the scheduled background
 * worker whether or not this component is even mounted, and the
 * `scanId` pointer below (never the results themselves) is the only
 * thing that survives a refresh client-side -- Supabase, reached via the
 * status/results APIs, remains the sole source of truth.
 *
 * Results are a real, ranked, paginated list (not a single "preview"
 * card) -- fetched once when the scan reaches a terminal status, and
 * again only on an explicit "Load more" click. The status endpoint keeps
 * polling lightweight (a cheap count, never the full result set) while
 * the scan is still running.
 */

const POLL_INTERVAL_MS = 4000;
const RESULTS_PAGE_SIZE = 20;
const POINTER_STORAGE_KEY = "partnra:deepDiscoveryPointer";

type PanelStatus =
  | "idle"
  | "starting"
  | "restoring"
  | "running"
  | "completed"
  | "completed_with_warnings"
  | "failed"
  | "unavailable"
  | "error";

interface DeepDiscoveryProgress {
  comparableBrandsTarget: number | null;
  comparableBrandsAnalysed: number;
  signalsReviewed: number;
  entitiesResolved: number;
  relationshipsFound: number;
  /** The real, user-facing count -- quality_tier != 'weak', the same bar the results list itself uses. Never scan.opportunity_count directly. */
  opportunitiesQualified: number;
  jobsQueued: number;
  jobsRunning: number;
}

interface StatusResponse {
  status: string;
  progress: DeepDiscoveryProgress;
  warnings: unknown[];
  error: string | null;
}

export interface QualifiedOpportunityItem {
  entityId: string;
  name: string;
  partnerType: string | null;
  partnraFit: number;
  geographicFit: string;
  relationshipDirection: string;
  evidenceConfidence: string;
  qualityTier: string;
  potentialRelationship: string | null;
  applicationUrl: string | null;
  contact: string | null;
  comparableBrands: string[];
  crossBrandCount: number;
  evidenceUrl: string | null;
  sourcePlatform: string | null;
}

interface ResultsResponse {
  items: QualifiedOpportunityItem[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface DeepDiscoveryPointer {
  scanId: string;
  domain: string;
}

/** The ONLY thing ever written to localStorage for Deep Discovery -- a pointer, never results/counters. Safe to fail (private browsing, disabled storage, malformed JSON left over from an older version). */
export function readStoredPointer(): DeepDiscoveryPointer | null {
  try {
    const raw = window.localStorage.getItem(POINTER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).scanId === "string" &&
      typeof (parsed as Record<string, unknown>).domain === "string"
    ) {
      return parsed as DeepDiscoveryPointer;
    }
    return null;
  } catch {
    return null;
  }
}

function writeStoredPointer(pointer: DeepDiscoveryPointer): void {
  try {
    window.localStorage.setItem(POINTER_STORAGE_KEY, JSON.stringify(pointer));
  } catch {
    // Storage being unavailable never blocks the scan itself -- Supabase
    // already has it; the user just won't get refresh restoration.
  }
}

export function clearStoredPointer(): void {
  try {
    window.localStorage.removeItem(POINTER_STORAGE_KEY);
  } catch {
    // ignore
  }
}

const TERMINAL_STATUSES = new Set(["completed", "completed_with_warnings", "failed"]);

/** Pure so TEST A-D can exercise it directly: the persisted `status` string is the sole authority -- never gated on counters, never requiring analysed===target. An unrecognized status (e.g. "queued") is treated as still in progress, never as complete. */
export function derivePanelStatus(rawStatus: string): PanelStatus {
  if (rawStatus === "completed" || rawStatus === "completed_with_warnings" || rawStatus === "failed") {
    return rawStatus;
  }
  return "running";
}

export function isTerminalPanelStatus(status: PanelStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

function humanizeDirection(direction: string): string {
  return direction.replace(/_/g, " ");
}

function humanizeFit(fit: string): string {
  return fit.replace(/_/g, " ");
}

function OpportunityResultCard({ item }: { item: QualifiedOpportunityItem }) {
  return (
    <div className="rounded-xl border border-ink/8 bg-paper/70 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-base font-medium text-ink">{item.name || "Unnamed entity"}</span>
        {item.partnerType && (
          <span className="font-mono-label rounded-full bg-lime/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink/70">
            {item.partnerType}
          </span>
        )}
        <span className="font-mono-label rounded-full bg-ink/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink/50">
          Evidence: {item.evidenceConfidence}
        </span>
        {item.sourcePlatform && (
          <span className="font-mono-label rounded-full bg-ink/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink/50">
            {item.sourcePlatform}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-ink/60">
        {humanizeDirection(item.relationshipDirection)} · {humanizeFit(item.geographicFit)} market fit · Partnra Fit {item.partnraFit}
      </p>
      {item.potentialRelationship && <p className="mt-2 text-sm text-ink/70">{item.potentialRelationship}</p>}
      {item.comparableBrands.length > 0 && (
        <p className="font-mono-label mt-2 text-[11px] uppercase tracking-[0.1em] text-ink/40">
          Connected to {item.crossBrandCount} comparable brand{item.crossBrandCount === 1 ? "" : "s"}: {item.comparableBrands.join(", ")}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        {item.applicationUrl && (
          <a href={item.applicationUrl} target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-4">
            View application route
          </a>
        )}
        {item.evidenceUrl && (
          <a href={item.evidenceUrl} target="_blank" rel="noreferrer" className="text-ink/60 underline underline-offset-4">
            View evidence source
          </a>
        )}
        {item.contact && <span className="text-ink/55">Contact: {item.contact}</span>}
      </div>
    </div>
  );
}

export function DeepDiscoveryPanel({
  domain,
  initialScanId,
  onScanCleared,
}: {
  domain: string;
  /** Set only when restoring an already-started scan after a page load -- see DiscoveryScanner's pointer-restoration block. */
  initialScanId?: string;
  /** Fires only on a definitive 404 (the pointer no longer refers to a real scan) -- never on a transient network error, so a flaky connection can't destroy a valid pointer. */
  onScanCleared?: () => void;
}) {
  const [scanId, setScanId] = useState<string | null>(initialScanId ?? null);
  const [status, setStatus] = useState<PanelStatus>(initialScanId ? "restoring" : "idle");
  const [data, setData] = useState<StatusResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const requestIdRef = useRef(0);

  const [results, setResults] = useState<QualifiedOpportunityItem[]>([]);
  const [resultsHasMore, setResultsHasMore] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState(false);

  const isTerminal = isTerminalPanelStatus(status);

  useEffect(() => {
    if (!scanId || isTerminal) return;

    let cancelled = false;

    async function poll() {
      const myRequestId = ++requestIdRef.current;
      try {
        const res = await fetch(`/api/deep-discovery/status/${scanId}`, { cache: "no-store" });
        if (cancelled || myRequestId !== requestIdRef.current) return; // a slower, older request must never overwrite a newer one
        const json = (await res.json()) as Record<string, unknown>;
        if (cancelled || myRequestId !== requestIdRef.current) return;

        if (!res.ok) {
          if (res.status === 404) {
            // The pointer no longer refers to a real scan -- clear it and
            // fall back to the normal idle state rather than getting stuck.
            clearStoredPointer();
            setScanId(null);
            setStatus("idle");
            onScanCleared?.();
            return;
          }
          // Any other failure is treated as transient -- a single missed
          // poll must never erase an already-running/-restoring scan; the
          // next tick tries again.
          return;
        }

        const statusData = json as unknown as StatusResponse;
        setData(statusData);
        setStatus(derivePanelStatus(statusData.status));
      } catch {
        // Network error -- transient, self-heals on the next tick.
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [scanId, isTerminal, onScanCleared]);

  // Results are fetched exactly once per terminal transition (never on a
  // polling tick, and never re-fetched just because `data` was replaced by
  // an identical-looking terminal response) -- deliberately separate from
  // the lightweight status poll above, per the "don't download the full
  // result set on every 4-second tick" requirement.
  useEffect(() => {
    if (!scanId || !isTerminal) return;
    // Nothing to fetch -- a provably-zero qualified count never needs a
    // network round trip just to confirm an empty list.
    if (data?.progress.opportunitiesQualified === 0) return;
    let cancelled = false;

    async function loadFirstPage() {
      setResultsLoading(true);
      setResultsError(false);
      try {
        const res = await fetch(`/api/deep-discovery/results/${scanId}?limit=${RESULTS_PAGE_SIZE}&offset=0`, { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          setResultsError(true);
          return;
        }
        const json = (await res.json()) as ResultsResponse;
        if (cancelled) return;
        setResults(json.items);
        setResultsHasMore(json.hasMore);
      } catch {
        if (!cancelled) setResultsError(true);
      } finally {
        if (!cancelled) setResultsLoading(false);
      }
    }

    loadFirstPage();
    return () => {
      cancelled = true;
    };
    // data.progress.opportunitiesQualified is intentionally included: it's
    // stable by the time this effect can run (isTerminal only flips true in
    // the same poll that sets its final value, and polling then stops), so
    // this never causes a second fetch -- it's here only so the "skip
    // fetching a provably-empty result set" check above is honestly
    // reflected in the dependency array.
  }, [scanId, isTerminal, data?.progress.opportunitiesQualified]);

  async function loadMoreResults() {
    if (!scanId || resultsLoading) return;
    setResultsLoading(true);
    try {
      const res = await fetch(`/api/deep-discovery/results/${scanId}?limit=${RESULTS_PAGE_SIZE}&offset=${results.length}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as ResultsResponse;
      setResults((prev) => [...prev, ...json.items]);
      setResultsHasMore(json.hasMore);
    } catch {
      // Leave the existing page visible -- the button just stays available to retry.
    } finally {
      setResultsLoading(false);
    }
  }

  async function start() {
    setStatus("starting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/deep-discovery/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandUrl: domain }),
        cache: "no-store",
      });
      const json = (await res.json()) as { scanId?: string; error?: string };
      if (res.status === 501) {
        setStatus("unavailable");
        return;
      }
      if (!res.ok || !json.scanId) {
        setStatus("error");
        setErrorMsg(json.error ?? "Something went wrong starting Deep Discovery.");
        return;
      }
      writeStoredPointer({ scanId: json.scanId, domain });
      setStatus("running");
      setScanId(json.scanId);
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong starting Deep Discovery.");
    }
  }

  if (status === "unavailable") return null;

  if (status === "idle") {
    return (
      <div className="mt-4 flex flex-col items-start gap-2 rounded-2xl border border-ink/10 bg-surface/40 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-base font-medium tracking-tight text-ink">Want a deeper look?</p>
          <p className="mt-1 text-sm text-ink/55">
            PARTNRA will research the market in the background -- expand comparable brands, trace who actually works
            with them, and verify real opportunities. You can leave this page; it keeps running.
          </p>
        </div>
        <button
          type="button"
          onClick={start}
          className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-paper transition-all duration-200 hover:brightness-110"
        >
          Search deeper
          <Arrow className="group-hover:translate-x-1 group-hover:-translate-y-1" />
        </button>
      </div>
    );
  }

  if (status === "starting" || status === "restoring" || (status === "running" && !data)) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-ink/10 bg-surface/40 p-5">
        <span className="pulse-dot h-2 w-2 shrink-0 rounded-full bg-lime" />
        <span className="font-mono-label text-sm text-ink/60">
          {status === "restoring" ? "Restoring your Deep Discovery scan..." : "Starting Deep Discovery..."}
        </span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mt-4 rounded-2xl border border-ink/10 bg-surface/40 p-5">
        <p className="text-sm text-ink/70">{errorMsg}</p>
      </div>
    );
  }

  if (!data) return null;

  const p = data.progress;
  const isRunning = status === "running";
  const isCompletedWithWarnings = status === "completed_with_warnings";

  return (
    <div className="mt-4 rounded-2xl border border-ink/10 bg-surface/40 p-5">
      <div className="flex items-center gap-3">
        {isRunning && <span className="pulse-dot h-2 w-2 shrink-0 rounded-full bg-lime" />}
        <span className="font-mono-label text-sm text-ink/60">
          {isRunning ? "Deep Discovery running" : status === "failed" ? "Deep Discovery failed" : "Deep Discovery complete"}
        </span>
      </div>
      <p className="font-mono-label mt-2 text-[11px] uppercase tracking-[0.1em] text-ink/40">
        {p.comparableBrandsTarget
          ? isRunning
            ? `${p.comparableBrandsAnalysed} / ${p.comparableBrandsTarget} comparable brands analysed`
            : `${p.comparableBrandsAnalysed} of ${p.comparableBrandsTarget} comparable brands analysed`
          : "Expanding comparable brands..."}
        {p.signalsReviewed > 0 ? ` · ${p.signalsReviewed} public signals reviewed` : ""}
        {isTerminal ? ` · ${p.opportunitiesQualified} qualified opportunit${p.opportunitiesQualified === 1 ? "y" : "ies"}` : ""}
      </p>

      {isCompletedWithWarnings && (
        <p className="mt-2 text-sm text-ink/50">A few steps didn&rsquo;t finish, but the results below are real and safe to use.</p>
      )}

      {isTerminal && status !== "failed" && (
        <div className="mt-4">
          {p.opportunitiesQualified === 0 && !resultsLoading && (
            <p className="text-sm text-ink/55">
              Deep Discovery finished but didn&rsquo;t find a strong enough opportunity to show yet -- precision over padding.
            </p>
          )}

          {p.opportunitiesQualified > 0 && (
            <>
              <p className="font-mono-label text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">Top opportunities</p>
              <div className="mt-3 flex flex-col gap-3">
                {results.map((item) => (
                  <OpportunityResultCard key={item.entityId} item={item} />
                ))}
              </div>
              {resultsError && results.length === 0 && (
                <p className="mt-3 text-sm text-ink/55">Couldn&rsquo;t load results just now -- still safely persisted, try refreshing.</p>
              )}
              {(resultsHasMore || resultsLoading) && (
                <button
                  type="button"
                  onClick={loadMoreResults}
                  disabled={resultsLoading}
                  className="font-mono-label mt-4 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/60 underline underline-offset-4 disabled:opacity-50"
                >
                  {resultsLoading ? "Loading..." : "Load more"}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
