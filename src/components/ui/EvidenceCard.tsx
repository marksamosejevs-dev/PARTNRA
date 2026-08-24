"use client";

import { useState } from "react";
import clsx from "clsx";
import { Arrow } from "./Arrow";
import { CountUp } from "./CountUp";
import type { Candidate } from "@/lib/discovery/types";

export function EvidenceCard({ candidate }: { candidate: Candidate }) {
  const [added, setAdded] = useState(false);

  return (
    <div className="rounded-2xl border border-ink/10 bg-paper p-6 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-2xl font-medium tracking-tight text-ink">
            {candidate.name ?? "Unnamed source"}
          </h3>
          <div className="mt-1 text-sm text-ink/45">
            {[candidate.platform, candidate.type].filter(Boolean).join(" · ") || "Source"}
            {candidate.sourceCount > 1 && (
              <span className="ml-2 font-mono-label text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/35">
                +{candidate.sourceCount - 1} more source{candidate.sourceCount - 1 === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono-label text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">
            Confidence
          </div>
          <div className="font-display mt-1 text-3xl font-medium tracking-tight text-ink">
            <CountUp value={candidate.confidence} suffix="%" />
          </div>
        </div>
      </div>

      {candidate.evidenceType && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-lime/20 px-3 py-1">
          <span className="font-mono-label text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/75">
            {candidate.evidenceType}
          </span>
        </div>
      )}

      <p className="mt-4 text-base leading-relaxed text-ink/70">{candidate.evidence}</p>

      {candidate.promoCode && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-ink/10 bg-surface/60 px-3 py-1.5">
          <span className="font-mono-label text-xs text-ink/45">CODE</span>
          <span className="font-mono-label text-sm font-semibold text-ink">{candidate.promoCode}</span>
        </div>
      )}

      {!candidate.contact && (
        <div className="mt-3 text-sm text-ink/40">
          Contact: {candidate.contactStatus === "not_found" ? "Not found" : "Coming soon"}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-ink/10 pt-5">
        <a
          href={candidate.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2 text-sm font-semibold text-ink transition-opacity hover:opacity-60"
        >
          View evidence
          <Arrow className="group-hover:translate-x-1 group-hover:-translate-y-1" />
        </a>
        {candidate.contact && (
          <a
            href={`mailto:${candidate.contact}`}
            className="group inline-flex items-center gap-2 text-sm font-semibold text-ink transition-opacity hover:opacity-60"
          >
            Contact
            <Arrow className="group-hover:translate-x-1 group-hover:-translate-y-1" />
          </a>
        )}
        <button
          type="button"
          onClick={() => setAdded(true)}
          disabled={added}
          className={clsx(
            "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-200",
            added
              ? "bg-lime text-ink shadow-[0_0_20px_2px_rgba(199,255,53,0.4)]"
              : "border border-ink/15 text-ink hover:border-ink/30"
          )}
        >
          {added ? "Added to pipeline" : "Add to pipeline"}
        </button>
      </div>
    </div>
  );
}
