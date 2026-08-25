"use client";

import { motion } from "framer-motion";
import { Container } from "./ui/Container";
import { Reveal } from "./ui/Reveal";

const CREATOR_A = {
  name: "Creator A",
  followers: "520K followers",
  points: [
    { text: "No affiliate links", positive: false },
    { text: "No discount codes", positive: false },
    { text: "No competitor partnerships", positive: false },
    { text: "No recent product promotions", positive: false },
  ],
  score: 31,
};

const CREATOR_B = {
  name: "Creator B",
  followers: "24K followers",
  points: [
    { text: "3 competitor partnerships", positive: true },
    { text: "2 active discount codes", positive: true },
    { text: "Affiliate links detected", positive: true },
    { text: "Recent promotional activity", positive: true },
    { text: "UK audience", positive: true },
  ],
  score: 92,
};

function CreatorCard({
  creator,
  highlight,
}: {
  creator: typeof CREATOR_A;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "flex flex-col rounded-3xl border p-8 md:p-10 " +
        (highlight
          ? "border-lime bg-ink text-paper"
          : "border-ink/10 bg-paper text-ink/60")
      }
    >
      <div>
        <div
          className={
            "font-display text-2xl font-medium tracking-tight md:text-3xl " +
            (highlight ? "text-paper" : "text-ink/70")
          }
        >
          {creator.name}
        </div>
        <div
          className={
            "font-mono-label mt-1 text-xs font-semibold uppercase tracking-[0.16em] " +
            (highlight ? "text-paper/40" : "text-ink/35")
          }
        >
          {creator.followers}
        </div>
      </div>

      <ul className="mt-8 flex flex-col gap-3">
        {creator.points.map((p) => (
          <li key={p.text} className="flex items-center gap-3 text-[15px] md:text-base">
            <span className={p.positive ? "text-lime" : "text-ink/25"}>
              {p.positive ? "✓" : "✕"}
            </span>
            <span className={highlight ? "text-paper/80" : "text-ink/45"}>{p.text}</span>
          </li>
        ))}
      </ul>

      <div className="mt-10 border-t border-current/10 pt-6">
        <div
          className={
            "font-mono-label text-xs font-semibold uppercase tracking-[0.18em] " +
            (highlight ? "text-lime" : "text-ink/35")
          }
        >
          PARTNRA fit
        </div>
        <div className="mt-3 flex items-end gap-4">
          <span
            className={
              "font-display text-6xl font-medium tracking-tight md:text-7xl " +
              (highlight ? "text-paper" : "text-ink/30")
            }
          >
            {creator.score}
          </span>
          <div className="mb-2 h-1.5 flex-1 overflow-hidden rounded-full bg-current/10">
            <motion.div
              className={"h-full rounded-full " + (highlight ? "bg-lime" : "bg-ink/25")}
              initial={{ width: 0 }}
              whileInView={{ width: `${creator.score}%` }}
              viewport={{ once: true }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function CreatorComparison() {
  return (
    <section className="py-24 md:py-36">
      <Container>
        <div className="relative grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
          <Reveal>
            <CreatorCard creator={CREATOR_A} />
          </Reveal>
          <Reveal delay={0.1}>
            <CreatorCard creator={CREATOR_B} highlight />
          </Reveal>

          <div className="pointer-events-none absolute left-1/2 top-1/2 hidden h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-ink/15 bg-paper font-mono-label text-xs font-semibold text-ink/50 md:flex">
            VS
          </div>
        </div>

        <Reveal delay={0.2}>
          <p className="font-display mt-16 max-w-3xl text-[clamp(1.8rem,4.8vw,3.4rem)] font-medium leading-[1.05] tracking-tight">
            We&rsquo;d recruit <span className="bg-lime px-2">Creator B</span> first.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
