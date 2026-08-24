import { Container } from "./ui/Container";
import { SectionLabel } from "./ui/SectionLabel";
import { Reveal } from "./ui/Reveal";

const STEPS = [
  {
    title: "Discover",
    detail: "Alex analyses your brand and identifies relevant competitors.",
  },
  {
    title: "Hunt",
    detail:
      "Finds creators, publishers, blogs, review sites and affiliates already promoting them.",
  },
  {
    title: "Qualify",
    detail: "Separates genuine commercial affiliates from irrelevant mentions.",
  },
  {
    title: "Research",
    detail: "Finds relevant publicly available business information.",
  },
  {
    title: "Contact",
    detail: "Creates personalised recruitment outreach based on actual commercial activity.",
  },
  {
    title: "Follow up",
    detail: "Helps keep recruitment conversations moving.",
  },
  {
    title: "Recruit",
    detail: "Helps move qualified partners into your existing affiliate programme.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 border-t border-ink/10 py-24 md:py-36">
      <Container>
        <Reveal>
          <SectionLabel>The system</SectionLabel>
        </Reveal>

        <div className="mt-10 flex flex-col">
          {STEPS.map((step) => (
            <Reveal key={step.title} y={32}>
              <div className="grid grid-cols-1 items-start gap-2 border-t border-ink/10 py-8 last:border-b md:grid-cols-[1fr_1.6fr] md:items-center md:gap-8 md:py-10">
                <h3 className="font-display text-2xl font-medium tracking-tight md:text-3xl">
                  {step.title}
                </h3>
                <p className="max-w-md text-base leading-relaxed text-ink/55 md:text-lg">
                  {step.detail}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
