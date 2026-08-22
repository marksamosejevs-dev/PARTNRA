import { Container } from "./ui/Container";
import { SectionLabel } from "./ui/SectionLabel";
import { Reveal } from "./ui/Reveal";

const COLUMNS = [
  {
    label: "Now",
    tone: "live" as const,
    items: [
      "Discovery",
      "Competitor intelligence",
      "Qualification",
      "Contact discovery",
      "Outreach assistance",
    ],
  },
  {
    label: "Next",
    tone: "next" as const,
    items: ["Reply management", "Follow-ups", "AI negotiation", "Affiliate onboarding"],
  },
  {
    label: "Later",
    tone: "later" as const,
    items: [
      "Affiliate tracking",
      "Commission management",
      "Payouts",
      "Performance optimisation",
    ],
  },
];

export function Roadmap() {
  return (
    <section className="border-t border-ink/10 bg-surface py-24 md:py-36">
      <Container>
        <Reveal>
          <SectionLabel>Product roadmap</SectionLabel>
        </Reveal>

        <Reveal delay={0.06}>
          <h2 className="font-display mt-6 max-w-2xl text-[clamp(2rem,5.5vw,4rem)] font-medium leading-[1.05] tracking-tight">
            Recruitment is only the beginning.
          </h2>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {COLUMNS.map((col, i) => (
            <Reveal key={col.label} delay={0.1 + i * 0.08}>
              <div className="h-full rounded-3xl border border-ink/10 bg-paper p-7 md:p-8">
                <div className="flex items-center gap-2.5">
                  {col.tone === "live" && (
                    <span className="pulse-dot h-2 w-2 rounded-full bg-lime" />
                  )}
                  <span className="font-mono-label text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">
                    {col.label}
                  </span>
                </div>
                <ul className="mt-6 flex flex-col gap-3.5">
                  {col.items.map((item) => (
                    <li
                      key={item}
                      className={
                        "border-b border-ink/8 pb-3.5 text-base last:border-none " +
                        (col.tone === "live" ? "text-ink" : "text-ink/45")
                      }
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
