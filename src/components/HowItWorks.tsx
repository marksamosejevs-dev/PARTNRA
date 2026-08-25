import { Container } from "./ui/Container";
import { SectionLabel } from "./ui/SectionLabel";
import { Reveal } from "./ui/Reveal";

const STEPS = [
  {
    title: "Tell us what you sell",
    detail: "Enter your website or describe your product.",
  },
  {
    title: "PARTNRA searches the web",
    detail: "We identify relevant brands, creators, affiliates, publishers and commercial partners.",
  },
  {
    title: "We rank the best opportunities",
    detail: "PARTNRA evaluates which potential partners are most relevant to your business.",
  },
  {
    title: "Turn them into partners",
    detail: "Review the strongest matches, get contact information and start outreach.",
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
