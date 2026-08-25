"use client";

import { useState } from "react";
import clsx from "clsx";
import { Arrow } from "./Arrow";
import { CountUp } from "./CountUp";
import type { Candidate, SignalStrength } from "@/lib/discovery/types";

const pillBase =
  "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200";
const pillIdle = "border border-ink/15 text-ink hover:border-ink/30";
const pillActive = "bg-lime text-ink shadow-[0_0_20px_2px_rgba(199,255,53,0.4)]";

/**
 * How this evidence was found, shown plainly so a category-level signal is
 * never mistaken for a confirmed competitor relationship. See
 * `SignalStrength` in lib/discovery/types.ts for what each tier means.
 */
const SIGNAL_LABEL: Record<SignalStrength, string> = {
  strong: "Strong signal",
  medium: "Medium signal",
  potential: "Potential fit",
};

const SIGNAL_BADGE_CLASS: Record<SignalStrength, string> = {
  strong: "bg-lime/20 text-ink/75",
  medium: "bg-ink/10 text-ink/60",
  potential: "border border-ink/15 text-ink/50",
};

/**
 * `demo` marks example/placeholder candidates (the static ExampleResults
 * section, or a dev-mock scan) -- their actions never navigate anywhere or
 * use the placeholder contact, they just give a brief acid-highlight
 * response so the UI still feels alive without pretending the lead is real.
 */
export function EvidenceCard({ candidate, demo = false }: { candidate: Candidate; demo?: boolean }) {
  const [added, setAdded] = useState(false);
  const [evidenceRevealed, setEvidenceRevealed] = useState(false);
  const [contactRevealed, setContactRevealed] = useState(false);

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

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className={clsx("inline-flex items-center gap-2 rounded-full px-3 py-1", SIGNAL_BADGE_CLASS[candidate.signalStrength])}>
          <span className="font-mono-label text-[11px] font-semibold uppercase tracking-[0.14em]">
            {SIGNAL_LABEL[candidate.signalStrength]}
          </span>
        </div>
        {candidate.evidenceType && (
          <div className="inline-flex items-center gap-2 rounded-full bg-ink/5 px-3 py-1">
            <span className="font-mono-label text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/60">
              {candidate.evidenceType}
            </span>
          </div>
        )}
        {!candidate.verified && (
          <div className="inline-flex items-center gap-2 rounded-full border border-dashed border-ink/20 px-3 py-1">
            <span className="font-mono-label text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/45">
              Not yet AI-verified
            </span>
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="font-mono-label text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">
          Why PARTNRA found this
        </div>
        <p className="mt-1.5 text-base leading-relaxed text-ink/70">{candidate.evidence}</p>
      </div>

      {candidate.promoCode && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-ink/10 bg-surface/60 px-3 py-1.5">
          <span className="font-mono-label text-xs text-ink/45">CODE</span>
          <span className="font-mono-label text-sm font-semibold text-ink">{candidate.promoCode}</span>
        </div>
      )}

      {!demo && !candidate.contact && (
        <div className="mt-3 text-sm text-ink/40">
          Contact: {candidate.contactStatus === "not_found" ? "Not found" : "Coming soon"}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-ink/10 pt-5">
        {demo ? (
          <button
            type="button"
            onClick={() => setEvidenceRevealed(true)}
            className={clsx(pillBase, evidenceRevealed ? pillActive : pillIdle)}
          >
            {evidenceRevealed ? "Demo evidence" : "View evidence"}
          </button>
        ) : (
          <a
            href={candidate.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-ink transition-opacity hover:opacity-60"
          >
            View evidence
            <Arrow className="group-hover:translate-x-1 group-hover:-translate-y-1" />
          </a>
        )}

        {demo ? (
          <button
            type="button"
            onClick={() => setContactRevealed(true)}
            className={clsx(pillBase, contactRevealed ? pillActive : pillIdle)}
          >
            {contactRevealed ? "Contact available in live results" : "Contact"}
          </button>
        ) : (
          candidate.contact && (
            <a
              href={`mailto:${candidate.contact}`}
              className="group inline-flex items-center gap-2 text-sm font-semibold text-ink transition-opacity hover:opacity-60"
            >
              Contact
              <Arrow className="group-hover:translate-x-1 group-hover:-translate-y-1" />
            </a>
          )
        )}

        <button
          type="button"
          onClick={() => setAdded(true)}
          disabled={added}
          className={clsx(pillBase, added ? pillActive : pillIdle)}
        >
          {added ? "Added ✓" : "Add to pipeline"}
        </button>
      </div>
    </div>
  );
}
