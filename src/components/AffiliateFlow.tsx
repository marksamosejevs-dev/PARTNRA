"use client";

import { motion, useReducedMotion } from "framer-motion";

const STEPS = [
  { label: "YOUR COMPETITORS", detail: "Brands you compete with today" },
  { label: "THEIR PARTNERS", detail: "Creators, publishers, distributors" },
  { label: "PARTNRA FINDS THEM", detail: "Signals, ranking, contact research", lime: true },
  { label: "YOU RECRUIT THEM", detail: "Into active partnerships" },
];

export function AffiliateFlow() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="relative w-full max-w-sm">
      <svg
        className="absolute left-[15px] top-3 h-[calc(100%-24px)] w-[2px] md:left-[17px]"
        width="2"
        height="100%"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <line x1="1" y1="0" x2="1" y2="100%" stroke="var(--color-ink)" strokeOpacity="0.12" />
        <motion.line
          x1="1"
          y1="0"
          x2="1"
          y2="100%"
          stroke="var(--color-lime)"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        />
      </svg>

      <div className="flex flex-col gap-9">
        {STEPS.map((step, i) => (
          <motion.div
            key={step.label}
            className="relative flex items-start gap-5 pl-0"
            initial={{ opacity: 0, x: prefersReducedMotion ? 0 : -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.5, delay: i * 0.12 + 0.2 }}
          >
            <span
              className={
                "relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold md:h-9 md:w-9 " +
                (step.lime
                  ? "border-lime bg-lime text-ink"
                  : "border-ink/20 bg-paper text-ink/60")
              }
            >
              {step.lime ? (
                <span className="pulse-dot h-2 w-2 rounded-full bg-ink" />
              ) : (
                i + 1
              )}
            </span>
            <div className="pt-1">
              <div
                className={
                  "font-mono-label text-[12px] font-semibold tracking-[0.14em] md:text-sm " +
                  (step.lime ? "text-ink" : "text-ink/85")
                }
              >
                {step.label}
              </div>
              <div className="mt-1 text-[13px] text-ink/50">{step.detail}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
