"use client";

import { useState } from "react";
import { Container } from "./ui/Container";
import { Reveal } from "./ui/Reveal";

const INTEL = [
  { label: "Name", value: "Sarah" },
  { label: "Category", value: "UK wellness creator" },
  { label: "Recent partnerships", value: "3 UK wellness brands" },
  { label: "Content theme", value: "Daily supplementation" },
  { label: "Audience geo", value: "UK-majority" },
];

const EMAIL = `Hi Sarah,

I noticed you've recently worked with several UK wellness brands and have shared content around daily supplementation.

We're working with a growing wellness brand that looks closely aligned with your audience.

The programme currently offers:
— 20% CPS
— 60-day attribution
— personal discount code
— higher commission based on performance

Would you be interested in taking a look?`;

type Status = "approve" | "skip" | null;

export function OutreachDemo() {
  const [status, setStatus] = useState<Status>(null);

  return (
    <section className="border-t border-ink/10 bg-surface py-24 md:py-36">
      <Container>
        <Reveal>
          <h2 className="font-display max-w-2xl text-[clamp(1.9rem,5vw,3.4rem)] font-medium leading-[1.05] tracking-tight">
            Not another 5,000-email spam machine.
          </h2>
        </Reveal>
        <Reveal delay={0.06}>
          <p className="mt-4 max-w-xl text-lg text-ink/55 md:text-xl">
            Alex researches before he writes.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 overflow-hidden rounded-3xl border border-ink/10 lg:grid-cols-2">
          <Reveal delay={0.1} className="bg-ink p-8 text-paper md:p-10">
            <div className="font-mono-label text-xs font-semibold uppercase tracking-[0.16em] text-paper/40">
              Affiliate intelligence
            </div>
            <div className="mt-6 flex flex-col gap-4">
              {INTEL.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-4 border-b border-white/10 pb-4"
                >
                  <span className="text-sm text-paper/40">{item.label}</span>
                  <span className="text-right text-sm font-medium text-paper/85">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.18} className="bg-paper p-8 md:p-10">
            <div className="font-mono-label text-xs font-semibold uppercase tracking-[0.16em] text-ink/40">
              Personalised outreach — draft
            </div>
            <pre className="mt-6 whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-ink/80 md:text-[15px]">
              {EMAIL}
            </pre>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-ink/10 pt-6">
              <div className="inline-flex items-center gap-2">
                <span className="font-mono-label text-xs font-semibold uppercase tracking-[0.14em] text-ink/40">
                  Personalisation
                </span>
                <span className="font-display text-lg font-medium text-ink">96%</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStatus("approve")}
                  className="rounded-full bg-lime px-4 py-2 text-sm font-semibold text-ink hover:opacity-85"
                >
                  Approve
                </button>
                <button className="rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30">
                  Edit
                </button>
                <button
                  onClick={() => setStatus("skip")}
                  className="rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/50 hover:border-ink/30"
                >
                  Skip
                </button>
              </div>
            </div>

            {status && (
              <div className="mt-4 rounded-xl bg-surface px-4 py-3 text-sm text-ink/60">
                {status === "approve"
                  ? "Draft approved. It's queued for you to send from your own inbox."
                  : "Skipped. Alex moves to the next prospect."}
              </div>
            )}
          </Reveal>
        </div>

        <Reveal delay={0.24}>
          <p className="mt-6 max-w-xl text-sm text-ink/40">
            Alex prepares the research and the draft. Nothing is sent automatically —
            outreach is reviewed and approved by you.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
