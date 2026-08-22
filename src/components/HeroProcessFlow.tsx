"use client";

import { motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { Arrow } from "./ui/Arrow";

const LEAVES = [
  { label: "Creator", detected: true },
  { label: "Review site", detected: false },
  { label: "Publisher", detected: true },
  { label: "Newsletter", detected: false },
];

function DiscoverGraphic() {
  return (
    <div>
      <div className="flex justify-center">
        <div className="rounded-lg border border-ink/15 bg-surface px-3 py-1.5">
          <span className="font-mono-label text-[9px] font-semibold uppercase tracking-[0.1em] text-ink/60">
            Your competitor
          </span>
        </div>
      </div>

      <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full" aria-hidden="true">
        <line x1="50" y1="0" x2="12.5" y2="32" stroke="var(--color-ink)" strokeOpacity="0.15" strokeWidth="1" />
        <line x1="50" y1="0" x2="37.5" y2="32" stroke="var(--color-ink)" strokeOpacity="0.15" strokeWidth="1" />
        <line x1="50" y1="0" x2="62.5" y2="32" stroke="var(--color-ink)" strokeOpacity="0.15" strokeWidth="1" />
        <line x1="50" y1="0" x2="87.5" y2="32" stroke="var(--color-ink)" strokeOpacity="0.15" strokeWidth="1" />
      </svg>

      <div className="flex justify-between gap-1.5">
        {LEAVES.map((leaf) => (
          <div key={leaf.label} className="flex flex-1 flex-col items-center gap-1">
            <span className={clsx("h-1.5 w-1.5 rounded-full", leaf.detected ? "bg-lime" : "bg-transparent")} />
            <div className="w-full rounded-md border border-ink/10 bg-paper px-1 py-1.5 text-center">
              <span className="text-[8.5px] font-medium leading-tight text-ink/55">{leaf.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const RANKINGS = [
  { rank: "01", name: "Creator A", score: 92, primary: true },
  { rank: "02", name: "Publisher B", score: 81, primary: false },
  { rank: "03", name: "Creator C", score: 74, primary: false },
];

function ScoreGraphic() {
  return (
    <div className="flex flex-col gap-2.5">
      {RANKINGS.map((row, i) => (
        <div key={row.rank} className="flex items-center gap-2.5">
          <span className="font-mono-label w-4 shrink-0 text-[10px] text-ink/35">{row.rank}</span>
          <span className="w-[74px] shrink-0 truncate text-[11.5px] font-medium text-ink/70">
            {row.name}
          </span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink/8">
            <motion.div
              className={clsx("h-full rounded-full", row.primary ? "bg-lime" : "bg-ink/25")}
              initial={{ width: 0 }}
              whileInView={{ width: `${row.score}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.15 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <span className="font-mono-label w-6 shrink-0 text-right text-[10.5px] text-ink/50">
            {row.score}
          </span>
        </div>
      ))}
    </div>
  );
}

function RecruitGraphic() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      <div className="rounded-lg border border-ink/15 bg-surface px-2.5 py-1.5">
        <span className="font-mono-label text-[9px] font-semibold uppercase tracking-[0.08em] text-ink/55">
          Competitor
        </span>
      </div>
      <Arrow direction="right" className="h-3 w-3 text-ink/25" />
      <div className="rounded-lg border border-ink/15 bg-surface px-2.5 py-1.5">
        <span className="font-mono-label text-[9px] font-semibold uppercase tracking-[0.08em] text-ink/55">
          Affiliate
        </span>
      </div>
      <Arrow direction="right" className="h-3 w-3 text-ink/25" />
      <div className="rounded-lg bg-lime px-2.5 py-1.5">
        <span className="font-mono-label text-[9px] font-semibold uppercase tracking-[0.08em] text-ink">
          Your brand
        </span>
      </div>
    </div>
  );
}

const STEPS = [
  {
    label: "Discover",
    text: "Find who's already promoting your competitors.",
    Graphic: DiscoverGraphic,
  },
  {
    label: "Score",
    text: "Prioritise the strongest affiliate prospects.",
    Graphic: ScoreGraphic,
  },
  {
    label: "Recruit",
    text: "Bring the best prospects into your programme.",
    Graphic: RecruitGraphic,
  },
];

const BASE_DELAY = 0.24;
const STEP_STAGGER = 0.14;

export function HeroProcessFlow() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="mx-auto max-w-sm md:max-w-none">
      {STEPS.map((step, i) => {
        const delay = BASE_DELAY + i * STEP_STAGGER;
        return (
          <div key={step.label}>
            <motion.div
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -10% 0px", amount: 0.2 }}
              transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl border border-ink/10 bg-paper/80 p-4 md:p-8"
            >
              <div className="md:flex md:items-center md:gap-14">
                <div className="md:w-1/2 md:shrink-0">
                  <span className="font-mono-label text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45 md:text-[13px]">
                    {step.label}
                  </span>
                  <p className="mt-1.5 text-[20px] font-semibold leading-snug tracking-tight text-ink md:mt-2.5 md:text-[28px] lg:text-[32px]">
                    {step.text}
                  </p>
                </div>
                <div className="mt-4 md:mt-0 md:w-1/2">
                  <div className="md:mx-auto md:max-w-xs">
                    <step.Graphic />
                  </div>
                </div>
              </div>
            </motion.div>

            {i < STEPS.length - 1 && (
              <div className="flex flex-col items-center py-1.5" aria-hidden="true">
                <motion.span
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.25, delay: delay + 0.3 }}
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime"
                />
                <motion.div
                  className="w-px bg-lime/40"
                  initial={{ height: 0 }}
                  whileInView={{ height: 12 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.25, delay: delay + 0.35 }}
                />
                <Arrow direction="right" className="h-3 w-3 rotate-90 text-ink/30" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
