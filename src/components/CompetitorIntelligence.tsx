"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Container } from "./ui/Container";
import { SectionLabel } from "./ui/SectionLabel";
import { Reveal } from "./ui/Reveal";

const SIGNAL_TYPES = ["Creators", "Promo codes", "Reviews", "Publishers", "Newsletters"];

function Node({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className="inline-flex items-center justify-center rounded-2xl border border-ink/10 bg-paper px-6 py-3.5 text-center"
    >
      <span className="font-mono-label text-xs font-semibold uppercase tracking-[0.16em] text-ink/70">
        {children}
      </span>
    </motion.div>
  );
}

function Connector({ delay }: { delay: number }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <div className="flex flex-col items-center py-2" aria-hidden="true">
      <motion.span
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.25, delay }}
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime"
      />
      <motion.div
        className="w-px bg-lime/40"
        initial={{ height: 0 }}
        whileInView={{ height: prefersReducedMotion ? 20 : 20 }}
        viewport={{ once: true }}
        transition={{ duration: 0.25, delay: delay + 0.08 }}
      />
    </div>
  );
}

export function CompetitorIntelligence() {
  return (
    <section className="border-t border-ink/10 py-24 md:py-36">
      <Container>
        <Reveal>
          <SectionLabel>Competitor intelligence</SectionLabel>
        </Reveal>

        <Reveal delay={0.06}>
          <h2 className="font-display mt-6 max-w-3xl text-[clamp(2rem,5.5vw,4.2rem)] font-medium leading-[1.03] tracking-tight">
            Partnra maps their entire affiliate network.
          </h2>
        </Reveal>

        <Reveal delay={0.12}>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink/60 md:text-xl">
            One competitor in, a mapped-out network of the people and sites already promoting
            them out — with the evidence behind every result.
          </p>
        </Reveal>

        <div className="mt-16 flex flex-col items-center">
          <Node delay={0}>Competitor</Node>
          <Connector delay={0.1} />
          <Node delay={0.15}>Scan the web</Node>
          <Connector delay={0.25} />

          <div className="flex flex-wrap items-center justify-center gap-3">
            {SIGNAL_TYPES.map((signal, i) => (
              <Node key={signal} delay={0.3 + i * 0.06}>
                {signal}
              </Node>
            ))}
          </div>

          <Connector delay={0.65} />
          <Node delay={0.7}>Verify evidence</Node>
          <Connector delay={0.8} />
          <Node delay={0.85}>Find contact</Node>
          <Connector delay={0.95} />
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.4, delay: 1, ease: [0.16, 1, 0.3, 1] }}
            className="inline-flex items-center justify-center rounded-2xl bg-lime px-7 py-4 text-center"
          >
            <span className="font-mono-label text-xs font-semibold uppercase tracking-[0.16em] text-ink">
              Recruit
            </span>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
