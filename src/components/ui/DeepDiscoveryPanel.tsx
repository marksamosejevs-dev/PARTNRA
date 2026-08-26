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
 * worker whether or not this component is even mounted.
 */

const POLL_INTERVAL_MS = 4000;

type PanelStatus = "idle" | "starting" | "running" | "completed" | "completed_with_warnings" | "failed" | "unavailable" | "error";

interface DeepDiscoveryProgress {
  comparableBrandsTarget: number | null;
  comparableBrandsAnalysed: number;
  signalsReviewed: number;
  entitiesResolved: number;
  relationshipsFound: number;
  opportunitiesQualified: number;
  jobsQueued: number;
  jobsRunning: number;
}

interface DeepDiscoveryPreview {
  name: string | null;
  partnerType: string | null;
  relationshipDirection: string;
  geographicFit: string;
  partnraFit: number;
  evidenceConfidence: "strong" | "medium" | "weak";
  qualityTier: string;
  potentialRelationship: string | null;
  applicationUrl: string | null;
  contact: string | null;
}

interface StatusResponse {
  status: string;
  progress: DeepDiscoveryProgress;
  preview: DeepDiscoveryPreview | null;
  additionalOpportunityCount: number;
  warnings: unknown[];
  error: string | null;
}

function humanizeDirection(direction: string): string {
  return direction.replace(/_/g, " ");
}

export function DeepDiscoveryPanel({ domain }: { domain: string }) {
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [data, setData] = useState<StatusResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  async function pollStatus(scanId: string) {
    try {
      const res = await fetch(`/api/deep-discovery/status/${scanId}`);
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(typeof json.error === "string" ? json.error : "Something went wrong.");
        if (pollTimer.current) clearInterval(pollTimer.current);
        return;
      }
      const statusData = json as unknown as StatusResponse;
      setData(statusData);
      if (statusData.status === "completed" || statusData.status === "completed_with_warnings" || statusData.status === "failed") {
        setStatus(statusData.status as PanelStatus);
        if (pollTimer.current) clearInterval(pollTimer.current);
      } else {
        setStatus("running");
      }
    } catch {
      // A single missed poll isn't fatal -- the scan is persisted server-
      // side regardless; just try again on the next tick.
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
      setStatus("running");
      await pollStatus(json.scanId);
      pollTimer.current = setInterval(() => pollStatus(json.scanId as string), POLL_INTERVAL_MS);
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

  if (status === "starting" || (status === "running" && !data)) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-ink/10 bg-surface/40 p-5">
        <span className="pulse-dot h-2 w-2 shrink-0 rounded-full bg-lime" />
        <span className="font-mono-label text-sm text-ink/60">Starting Deep Discovery...</span>
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

  return (
    <div className="mt-4 rounded-2xl border border-ink/10 bg-surface/40 p-5">
      <div className="flex items-center gap-3">
        {isRunning && <span className="pulse-dot h-2 w-2 shrink-0 rounded-full bg-lime" />}
        <span className="font-mono-label text-sm text-ink/60">
          {isRunning ? "Deep Discovery running" : status === "failed" ? "Deep Discovery failed" : "Deep Discovery complete"}
        </span>
      </div>
      <p className="font-mono-label mt-2 text-[11px] uppercase tracking-[0.1em] text-ink/40">
        {p.comparableBrandsTarget ? `${p.comparableBrandsAnalysed} / ${p.comparableBrandsTarget} comparable brands analysed` : "Expanding comparable brands..."}
        {p.signalsReviewed > 0 ? ` · ${p.signalsReviewed} public signals reviewed` : ""}
        {p.entitiesResolved > 0 ? ` · ${p.entitiesResolved} entities resolved` : ""}
        {p.opportunitiesQualified > 0 ? ` · ${p.opportunitiesQualified} qualified opportunit${p.opportunitiesQualified === 1 ? "y" : "ies"}` : ""}
      </p>

      {(status === "completed" || status === "completed_with_warnings") && data.preview && (
        <div className="mt-4 rounded-xl border border-ink/8 bg-paper/70 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-base font-medium text-ink">{data.preview.name ?? "Unnamed entity"}</span>
            {data.preview.partnerType && (
              <span className="font-mono-label rounded-full bg-lime/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink/70">
                {data.preview.partnerType}
              </span>
            )}
            <span className="font-mono-label rounded-full bg-ink/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink/50">
              Evidence: {data.preview.evidenceConfidence}
            </span>
          </div>
          <p className="mt-2 text-sm text-ink/60">
            {humanizeDirection(data.preview.relationshipDirection)} · {data.preview.geographicFit.replace(/_/g, " ")} market fit · Partnra Fit{" "}
            {data.preview.partnraFit}
          </p>
          {data.preview.potentialRelationship && <p className="mt-2 text-sm text-ink/70">{data.preview.potentialRelationship}</p>}
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            {data.preview.applicationUrl && (
              <a href={data.preview.applicationUrl} target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-4">
                View application route
              </a>
            )}
            {data.preview.contact && <span className="text-ink/55">Contact: {data.preview.contact}</span>}
          </div>
        </div>
      )}

      {(status === "completed" || status === "completed_with_warnings") && !data.preview && (
        <p className="mt-3 text-sm text-ink/55">
          Deep Discovery finished but didn&rsquo;t find a strong enough opportunity to preview yet -- precision over padding.
        </p>
      )}

      {(status === "completed" || status === "completed_with_warnings") && data.additionalOpportunityCount > 0 && (
        <p className="font-mono-label mt-3 text-[11px] uppercase tracking-[0.1em] text-ink/40">
          +{data.additionalOpportunityCount} more qualified opportunit{data.additionalOpportunityCount === 1 ? "y" : "ies"} found
        </p>
      )}
    </div>
  );
}
