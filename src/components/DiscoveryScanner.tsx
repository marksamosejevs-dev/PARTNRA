"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Arrow } from "./ui/Arrow";
import { EvidenceCard } from "./ui/EvidenceCard";
import { normalizeBrandUrl } from "@/lib/discovery/domain";
import type { Candidate, DiscoverErrorResponse, DiscoverResponse } from "@/lib/discovery/types";

const STAGES = [
  "Analysing your business...",
  "Finding similar brands...",
  "Finding people who already promote them...",
  "Ranking potential partners...",
  "Verifying evidence...",
];

const PREVIEW_ROWS = [
  { name: "Alex T.", platform: "YouTube", evidenceType: "Promo code", confidence: 91 },
  { name: "ReviewSite.co", platform: "Blog", evidenceType: "Affiliate link", confidence: 78 },
];

type Phase = "idle" | "scanning" | "results" | "empty" | "error";

function IdlePreview() {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-ink/15 bg-surface/40 p-5 md:p-6">
      <div className="flex items-center justify-between">
        <span className="font-mono-label text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">
          Partner signals
        </span>
        <span className="font-mono-label rounded-full bg-ink/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/40">
          Example preview
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {PREVIEW_ROWS.map((row) => (
          <div
            key={row.name}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-ink/8 bg-paper/70 px-4 py-3"
          >
            <span className="w-28 shrink-0 text-sm font-medium text-ink/60">{row.name}</span>
            <span className="font-mono-label text-[10px] uppercase tracking-[0.1em] text-ink/35">
              {row.platform}
            </span>
            <span className="inline-flex items-center rounded-full bg-lime/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink/60">
              {row.evidenceType}
            </span>
            <span className="font-mono-label ml-auto text-sm text-ink/45">{row.confidence}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DiscoveryScanner() {
  const [brandUrl, setBrandUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [stageIndex, setStageIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<DiscoverResponse | null>(null);
  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (stageTimer.current) clearInterval(stageTimer.current);
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (phase === "scanning") return;

    if (!normalizeBrandUrl(brandUrl)) {
      setPhase("error");
      setErrorMsg("Enter a valid website, e.g. yourbrand.com");
      return;
    }

    setPhase("scanning");
    setStageIndex(0);
    setErrorMsg("");
    stageTimer.current = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, STAGES.length - 1));
    }, 900);

    try {
      const res = await fetch("/api/discover-affiliates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandUrl }),
      });
      const data = (await res.json()) as DiscoverResponse | DiscoverErrorResponse;

      if (!res.ok || "error" in data) {
        setPhase("error");
        setErrorMsg("error" in data ? data.error : "Something went wrong. Please try again.");
        return;
      }

      setResult(data);
      setPhase(data.candidates.length > 0 ? "results" : "empty");
    } catch {
      setPhase("error");
      setErrorMsg("Something went wrong. Please try again.");
    } finally {
      if (stageTimer.current) clearInterval(stageTimer.current);
    }
  }

  function reset() {
    setPhase("idle");
    setResult(null);
    setBrandUrl("");
    setErrorMsg("");
  }

  const shown: Candidate[] = result?.candidates.slice(0, 3) ?? [];
  const moreCount = result ? Math.max(result.totalFound - shown.length, 0) : 0;
  const strongCount = result?.candidates.filter((c) => c.confidence >= 85).length ?? 0;

  return (
    <div className="rounded-3xl border border-ink/10 bg-paper/80 p-5 md:p-8">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          inputMode="url"
          placeholder="https://yourbrand.com"
          value={brandUrl}
          onChange={(e) => setBrandUrl(e.target.value)}
          disabled={phase === "scanning"}
          className="h-14 w-full flex-1 rounded-full border border-ink/15 bg-paper px-6 text-base text-ink placeholder:text-ink/35 outline-none transition-colors focus:border-ink/40 disabled:opacity-60 md:h-16 md:text-lg"
        />
        <button
          type="submit"
          disabled={phase === "scanning"}
          className="group inline-flex h-14 shrink-0 items-center justify-center gap-2.5 rounded-full bg-lime px-8 text-base font-semibold text-ink shadow-[0_0_0_0_rgba(199,255,53,0)] transition-all duration-200 ease-out hover:scale-[1.02] hover:brightness-110 hover:shadow-[0_0_32px_4px_rgba(199,255,53,0.45)] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60 md:h-16 md:px-10 md:text-lg"
        >
          {phase === "scanning" ? "Scanning..." : "Find my partners"}
          {phase !== "scanning" && (
            <Arrow className="group-hover:translate-x-1 group-hover:-translate-y-1" />
          )}
        </button>
      </form>

      {phase === "idle" && <IdlePreview />}

      {phase === "scanning" && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-ink/10 bg-surface/40 p-5">
          <span className="pulse-dot h-2 w-2 shrink-0 rounded-full bg-lime" />
          <span className="font-mono-label text-sm text-ink/60">{STAGES[stageIndex]}</span>
        </div>
      )}

      {phase === "error" && (
        <div className="mt-6 rounded-2xl border border-ink/10 bg-surface/40 p-5">
          <p className="text-sm text-ink/70">{errorMsg}</p>
          <button
            type="button"
            onClick={reset}
            className="mt-3 text-sm font-semibold text-ink underline underline-offset-4"
          >
            Try again
          </button>
        </div>
      )}

      {phase === "empty" && (
        <div className="mt-6 rounded-2xl border border-ink/10 bg-surface/40 p-6 text-center">
          <p className="font-display text-xl font-medium tracking-tight text-ink">
            No strong partner signals found yet.
          </p>
          <p className="mt-2 text-sm text-ink/55">
            We couldn&rsquo;t confidently match this to comparable brands with an established
            partner presence. Try a different website, or double-check the URL.
          </p>
          <button
            type="button"
            onClick={reset}
            className="group mt-4 inline-flex items-center gap-2 text-sm font-semibold text-ink"
          >
            Try another website
            <Arrow className="group-hover:translate-x-1 group-hover:-translate-y-1" />
          </button>
        </div>
      )}

      {phase === "results" && result && (
        <div className="mt-6">
          {(result.businessCategory || result.competitorsAnalyzed.length > 0) && (
            <p className="font-mono-label mb-3 text-[11px] uppercase tracking-[0.1em] text-ink/35">
              {result.businessCategory ? `Category: ${result.businessCategory}` : "Category: unknown"}
              {result.competitorsAnalyzed.length > 0
                ? ` · compared against ${result.competitorsAnalyzed.join(", ")}`
                : ""}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display text-xl font-medium tracking-tight text-ink">
              {shown.length} potential {shown.length === 1 ? "partner" : "partners"} found
            </span>
            {strongCount > 0 && (
              <span className="font-mono-label rounded-full bg-lime/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/70">
                {strongCount} strong match{strongCount === 1 ? "" : "es"}
              </span>
            )}
            {result.mock && (
              <span className="font-mono-label rounded-full bg-ink/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/40">
                Demo data
              </span>
            )}
          </div>

          <div className="mt-5 flex flex-col gap-4">
            {shown.map((candidate, i) => (
              <EvidenceCard key={`${candidate.sourceUrl}-${i}`} candidate={candidate} demo={result.mock} />
            ))}
          </div>

          <div
            className={clsx(
              "mt-6 flex flex-col items-start gap-3 rounded-2xl border border-ink/10 bg-ink p-6 text-paper sm:flex-row sm:items-center sm:justify-between"
            )}
          >
            <div>
              <p className="font-display text-lg font-medium tracking-tight">
                Want the full picture?
              </p>
              <p className="mt-1 text-sm text-paper/55">
                {moreCount > 0
                  ? `${moreCount} more signal${moreCount === 1 ? "" : "s"} found. Unlock more scans, partner discovery and recruitment tools with PARTNRA.`
                  : "Unlock more scans, partner discovery and recruitment tools with PARTNRA."}
              </p>
            </div>
            <a
              href="#pricing"
              className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-lime px-6 py-3 text-sm font-semibold text-ink transition-all duration-200 hover:brightness-110"
            >
              Unlock PARTNRA
              <Arrow className="group-hover:translate-x-1 group-hover:-translate-y-1" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
