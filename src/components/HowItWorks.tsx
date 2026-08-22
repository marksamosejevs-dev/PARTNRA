import { Container } from "./ui/Container";
import { SectionLabel } from "./ui/SectionLabel";
import { Reveal } from "./ui/Reveal";

const STEPS = [
  {
    n: "01",
    title: "Discover",
    detail: "Alex analyses your brand and identifies relevant competitors.",
  },
  {
    n: "02",
    title: "Hunt",
    detail:
      "Finds creators, publishers, blogs, review sites and affiliates already promoting them.",
  },
  {
    n: "03",
    title: "Qualify",
    detail: "Separates genuine commercial affiliates from irrelevant mentions.",
  },
  {
    n: "04",
    title: "Research",
    detail: "Finds relevant publicly available business information.",
  },
  {
    n: "05",
    title: "Contact",
    detail: "Creates personalised recruitment outreach based on actual commercial activity.",
  },
  {
    n: "06",
    title: "Follow up",
    detail: "Helps keep recruitment conversations moving.",
  },
  {
    n: "07",
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
            <Reveal key={step.n} y={32}>
              <div className="grid grid-cols-[3.5rem_1fr] items-start gap-4 border-t border-ink/10 py-8 last:border-b sm:grid-cols-[6rem_1fr] sm:items-center sm:gap-8 md:py-10">
                <span className="font-display text-3xl font-medium tracking-tight text-ink/20 sm:text-5xl md:text-6xl">
                  {step.n}
                </span>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1.6fr] md:items-center md:gap-8">
                  <h3 className="font-display text-2xl font-medium tracking-tight md:text-3xl">
                    {step.title}
                  </h3>
                  <p className="max-w-md text-base leading-relaxed text-ink/55 md:text-lg">
                    {step.detail}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
