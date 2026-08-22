"use client";

import { motion } from "framer-motion";
import { Container } from "./ui/Container";
import { SectionLabel } from "./ui/SectionLabel";
import { Reveal, RevealGroup, RevealItem } from "./ui/Reveal";
import { CountUp } from "./ui/CountUp";
import { Arrow } from "./ui/Arrow";

const METRICS = [
  { value: 37, label: "High intent" },
  { value: 86, label: "UK" },
  { value: 173, label: "Contactable" },
  { value: 21, label: "Promote 2+ competitors" },
];

const COMPETITORS = [
  { name: "Competitor A", value: 97 },
  { name: "Competitor B", value: 71 },
  { name: "Competitor C", value: 43 },
  { name: "Competitor D", value: 31 },
];

export function CompetitorIntelligence() {
  return (
    <section className="border-t border-ink/10 py-24 md:py-36">
      <Container>
        <Reveal>
          <SectionLabel>Competitor intelligence</SectionLabel>
        </Reveal>

        <Reveal delay={0.06}>
          <h2 className="font-display mt-6 max-w-3xl text-[clamp(2rem,5.5vw,4.2rem)] font-medium leading-[1.03] tracking-tight">
            Your competitors built the list for you.
          </h2>
        </Reveal>

        <Reveal delay={0.16}>
          <div className="mt-14 overflow-hidden rounded-3xl border border-ink/10 bg-surface/60">
            <div className="flex flex-col gap-3 border-b border-ink/10 p-5 sm:flex-row sm:items-center md:p-7">
              <div className="flex flex-1 items-center gap-3 rounded-full border border-ink/15 bg-paper px-5 py-3.5">
                <span className="font-mono-label text-sm text-ink/35">https://</span>
                <span className="font-mono-label text-sm text-ink/70">yourbrand.com</span>
              </div>
              <div className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-semibold text-paper">
                Analyse competitors <Arrow />
              </div>
            </div>

            <div className="p-5 md:p-7">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="font-display text-3xl font-medium tracking-tight md:text-4xl">
                  <CountUp value={427} /> potential affiliates detected
                </div>
                <span className="font-mono-label text-[11px] uppercase tracking-[0.16em] text-ink/35">
                  Sample output
                </span>
              </div>

              <RevealGroup className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {METRICS.map((m) => (
                  <RevealItem key={m.label}>
                    <div className="rounded-2xl border border-ink/10 bg-paper p-5">
                      <div className="font-display text-3xl font-medium tracking-tight text-ink md:text-4xl">
                        <CountUp value={m.value} />
                      </div>
                      <div className="mt-1 text-xs font-medium uppercase tracking-[0.1em] text-ink/40">
                        {m.label}
                      </div>
                    </div>
                  </RevealItem>
                ))}
              </RevealGroup>

              <div className="mt-10">
                <div className="font-mono-label mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-ink/40">
                  Where their affiliates promote
                </div>
                <div className="flex flex-col gap-4">
                  {COMPETITORS.map((c) => (
                    <div key={c.name} className="flex items-center gap-4">
                      <span className="w-28 shrink-0 text-sm text-ink/55 md:w-36 md:text-base">
                        {c.name}
                      </span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink/8">
                        <motion.div
                          className="h-full rounded-full bg-lime"
                          initial={{ width: 0 }}
                          whileInView={{ width: `${(c.value / 100) * 100}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </div>
                      <span className="font-mono-label w-8 shrink-0 text-right text-sm text-ink/60">
                        {c.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
