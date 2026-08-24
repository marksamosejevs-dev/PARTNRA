"use client";

import { Container } from "./ui/Container";
import { SectionLabel } from "./ui/SectionLabel";
import { Reveal } from "./ui/Reveal";
import { Button } from "./ui/Button";
import clsx from "clsx";
import { usePlanSelector } from "./PlanSelector";
import { PlanKey } from "@/lib/plans";

type Feature = string | { text: string; comingSoon: true };

interface Plan {
  key: PlanKey;
  name: string;
  price: string;
  tagline: string;
  features: Feature[];
  cta: string;
  highlighted?: boolean;
}

const PLANS: Plan[] = [
  {
    key: "starter",
    name: "Starter",
    price: "$49",
    tagline: "For small brands starting affiliate discovery.",
    features: [
      "10 competitor scans / month",
      "Up to 50 affiliate results / month",
      "Evidence-backed affiliate discovery",
      "Promo code & affiliate signal detection",
      { text: "Save up to 3 competitors", comingSoon: true },
      { text: "1 user", comingSoon: true },
      { text: "20 contact unlocks / month", comingSoon: true },
    ],
    cta: "Start discovering",
  },
  {
    key: "growth",
    name: "Growth",
    price: "$99",
    tagline: "For growing e-commerce brands actively recruiting affiliates.",
    features: [
      "50 competitor scans / month",
      "Up to 300 affiliate results / month",
      "Everything in Starter",
      { text: "Save up to 15 competitors", comingSoon: true },
      { text: "2 users", comingSoon: true },
      { text: "Up to 150 contact unlocks / month", comingSoon: true },
      { text: "CSV export", comingSoon: true },
      { text: "AI-assisted outreach", comingSoon: true },
    ],
    cta: "Start growing",
    highlighted: true,
  },
  {
    key: "pro",
    name: "Pro",
    price: "$199",
    tagline: "For brands and teams running affiliate acquisition at scale.",
    features: [
      "150 competitor scans / month",
      "Up to 1,000 affiliate results / month",
      "Everything in Growth",
      { text: "Save up to 50 competitors", comingSoon: true },
      { text: "5 users", comingSoon: true },
      { text: "Priority scanning", comingSoon: true },
      { text: "Up to 500 contact unlocks / month", comingSoon: true },
      { text: "CSV export", comingSoon: true },
      { text: "AI-assisted outreach", comingSoon: true },
    ],
    cta: "Go pro",
  },
];

function isComingSoon(feature: Feature): feature is { text: string; comingSoon: true } {
  return typeof feature !== "string";
}

export function Pricing() {
  const { open } = usePlanSelector();

  return (
    <section id="pricing" className="scroll-mt-24 border-t border-ink/10 py-24 md:py-36">
      <Container>
        <Reveal>
          <SectionLabel>Pricing</SectionLabel>
        </Reveal>

        <Reveal delay={0.06}>
          <h2 className="font-display mt-6 max-w-2xl text-[clamp(2rem,5.5vw,4.2rem)] font-medium leading-[1.03] tracking-tight">
            Simple pricing for competitor-based discovery.
          </h2>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={0.1 + i * 0.08} className="h-full">
              <div
                className={clsx(
                  "flex h-full flex-col rounded-3xl border p-8 md:p-10",
                  plan.highlighted
                    ? "border-ink bg-ink text-paper lg:scale-[1.04]"
                    : "border-ink/10 bg-paper text-ink"
                )}
              >
                {plan.highlighted && (
                  <div className="mb-4 inline-flex w-fit items-center rounded-full bg-lime px-3 py-1">
                    <span className="font-mono-label text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">
                      Most popular
                    </span>
                  </div>
                )}

                <div className="font-mono-label text-xs font-semibold uppercase tracking-[0.16em] opacity-50">
                  {plan.name}
                </div>
                <div className="font-display mt-4 flex items-baseline gap-1.5">
                  <span className="text-5xl font-medium tracking-tight md:text-6xl">
                    {plan.price}
                  </span>
                  <span className="text-sm opacity-50">/ month</span>
                </div>
                <p className={clsx("mt-3 text-sm", plan.highlighted ? "text-paper/60" : "text-ink/50")}>
                  {plan.tagline}
                </p>

                <ul className="mt-8 flex flex-col gap-3.5">
                  {plan.features.map((feature) => {
                    const text = isComingSoon(feature) ? feature.text : feature;
                    return (
                      <li
                        key={text}
                        className={clsx(
                          "flex items-start justify-between gap-3 border-b pb-3.5 text-sm last:border-none",
                          plan.highlighted ? "border-paper/10" : "border-ink/8"
                        )}
                      >
                        <span className={plan.highlighted ? "text-paper/85" : "text-ink/75"}>
                          {text}
                        </span>
                        {isComingSoon(feature) && (
                          <span
                            className={clsx(
                              "font-mono-label shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em]",
                              plan.highlighted ? "bg-paper/10 text-paper/50" : "bg-ink/5 text-ink/40"
                            )}
                          >
                            Coming soon
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-8">
                  <Button
                    onClick={() => open(plan.key)}
                    variant={plan.highlighted ? "secondary" : "primary"}
                    className="w-full justify-center"
                  >
                    {plan.cta}
                  </Button>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.3}>
          <p className="mt-10 text-center text-sm text-ink/40">
            Billed monthly. Cancel anytime.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
