"use client";

import { useState } from "react";
import { Container } from "./ui/Container";
import { Reveal, RevealGroup, RevealItem } from "./ui/Reveal";
import { CountUp } from "./ui/CountUp";

const METRICS = [
  { value: 3481, label: "Profiles analysed" },
  { value: 127, label: "Qualified" },
  { value: 48, label: "Outreach prepared" },
  { value: 11, label: "Replies" },
  { value: 4, label: "Negotiations" },
  { value: 2, label: "Ready to onboard" },
];

const ACTIVITY = [
  { time: "21:04", text: "Affiliate detected promoting Competitor A" },
  { time: "21:06", text: "Business contact identified" },
  { time: "21:08", text: "Affiliate score: 94" },
  { time: "21:09", text: "Outreach prepared" },
  { time: "21:17", text: "Reply received" },
];

type Decision = "approve" | "counter" | "reject" | null;

const DECISION_COPY: Record<Exclude<Decision, null>, string> = {
  approve: "Approved at 25% CPS. Alex will confirm terms with James.",
  counter: "Counter-offer of 22% CPS sent for James to review.",
  reject: "Prospect declined. Alex will move on to the next match.",
};

export function AlexDashboard() {
  const [decision, setDecision] = useState<Decision>(null);

  return (
    <div className="pb-24 md:pb-36">
      <Container>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr] lg:gap-8">
          <Reveal className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-9">
            <div className="flex items-center justify-between">
              <span className="font-mono-label text-xs font-semibold uppercase tracking-[0.18em] text-paper/40">
                Today
              </span>
              <span className="font-mono-label text-[10px] uppercase tracking-[0.14em] text-paper/25">
                Product demonstration data
              </span>
            </div>

            <RevealGroup className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3" stagger={0.04}>
              {METRICS.map((m) => (
                <RevealItem key={m.label}>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 md:p-5">
                    <div className="font-display text-2xl font-medium tracking-tight text-paper md:text-3xl">
                      <CountUp value={m.value} />
                    </div>
                    <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-paper/40 md:text-xs">
                      {m.label}
                    </div>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>

            <div className="mt-8 border-t border-white/10 pt-6">
              <span className="font-mono-label text-xs font-semibold uppercase tracking-[0.18em] text-paper/40">
                Activity
              </span>
              <div className="mt-4 flex flex-col">
                {ACTIVITY.map((a) => (
                  <div
                    key={a.time + a.text}
                    className="flex items-center gap-4 border-b border-white/5 py-3 last:border-none"
                  >
                    <span className="font-mono-label w-12 shrink-0 text-xs text-paper/30">
                      {a.time}
                    </span>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />
                    <span className="text-[14px] text-paper/70 md:text-[15px]">{a.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="rounded-3xl border border-lime/25 bg-lime/[0.05] p-6 md:p-9">
            <div className="font-mono-label text-xs font-semibold uppercase tracking-[0.18em] text-lime">
              Needs your attention / 1
            </div>

            <div className="mt-5">
              <div className="font-display text-2xl font-medium tracking-tight text-paper md:text-3xl">
                James Carter
              </div>
              <div className="mt-1 text-sm text-paper/45">
                United Kingdom · Supplements / Fitness · YouTube / Instagram
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm italic text-paper/70">
              &ldquo;I usually work on 25% CPS.&rdquo;
            </div>

            <div className="mt-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-paper/35">
                Alex recommendation
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-paper/70">
                Start at 22% CPS and increase to 25% after £5,000 attributed monthly sales.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-2.5">
              <button
                onClick={() => setDecision("approve")}
                className="rounded-full bg-lime px-4 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-85"
              >
                Approve 25%
              </button>
              <button
                onClick={() => setDecision("counter")}
                className="rounded-full border border-white/20 px-4 py-2.5 text-sm font-semibold text-paper transition-colors hover:border-white/40"
              >
                Counter 22%
              </button>
              <button
                onClick={() => setDecision("reject")}
                className="rounded-full border border-white/10 px-4 py-2.5 text-sm font-semibold text-paper/50 transition-colors hover:text-paper/80"
              >
                Reject
              </button>
            </div>

            {decision && (
              <div className="mt-5 rounded-2xl bg-black/25 px-4 py-3 text-sm text-paper/70">
                {DECISION_COPY[decision]}
              </div>
            )}
          </Reveal>
        </div>
      </Container>
    </div>
  );
}
