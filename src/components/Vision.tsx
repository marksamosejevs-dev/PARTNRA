import { Container } from "./ui/Container";
import { SectionLabel } from "./ui/SectionLabel";
import { Reveal, RevealGroup, RevealItem } from "./ui/Reveal";

const FLOW = ["Find", "Research", "Qualify", "Recruit", "Negotiate", "Onboard", "Optimise"];

export function Vision() {
  return (
    <section className="bg-ink py-24 text-paper md:py-36">
      <Container>
        <Reveal>
          <SectionLabel tone="lime">The vision</SectionLabel>
        </Reveal>

        <Reveal delay={0.08}>
          <h2 className="font-display mt-6 max-w-3xl text-[clamp(2.2rem,6.5vw,5rem)] font-medium leading-[1.02] tracking-tight">
            Your entire affiliate department.
            <br />
            <span className="text-lime">One AI employee.</span>
          </h2>
        </Reveal>

        <RevealGroup className="mt-16 flex flex-wrap items-center gap-x-3 gap-y-4" stagger={0.06}>
          {FLOW.map((step, i) => (
            <RevealItem key={step} className="flex items-center gap-3">
              <span className="font-display text-xl font-medium tracking-tight text-paper/70 md:text-2xl">
                {step}
              </span>
              {i < FLOW.length - 1 && <span className="text-paper/25">→</span>}
            </RevealItem>
          ))}
        </RevealGroup>

        <Reveal delay={0.3}>
          <p className="font-display mt-16 text-[clamp(2.6rem,8vw,6rem)] font-medium tracking-tight text-lime">
            Alex.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
