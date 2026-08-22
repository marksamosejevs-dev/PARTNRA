import { Container } from "./ui/Container";
import { SectionLabel } from "./ui/SectionLabel";
import { Reveal } from "./ui/Reveal";

export function SimpleExample() {
  return (
    <section className="bg-ink py-24 text-paper md:py-36">
      <Container>
        <Reveal>
          <SectionLabel tone="paper">A simple example</SectionLabel>
        </Reveal>

        <Reveal delay={0.06}>
          <h2 className="font-display mt-6 max-w-3xl text-[clamp(2rem,5.5vw,4.2rem)] font-medium leading-[1.02] tracking-tight">
            Imagine you sell supplements.
          </h2>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="mt-10 max-w-2xl space-y-3 text-lg leading-relaxed text-paper/60 md:text-xl">
            <p>
              Your competitors already have creators, review sites and publishers sending
              customers to them.
            </p>
            <p>Some use discount codes.</p>
            <p>Some use affiliate links.</p>
            <p>Some promote several brands in your category.</p>
          </div>
        </Reveal>

        <Reveal delay={0.18}>
          <p className="font-display mt-16 max-w-4xl text-[clamp(1.75rem,4.6vw,3.4rem)] font-medium leading-[1.05] tracking-tight">
            These people already know how to sell products like yours.
          </p>
        </Reveal>

        <Reveal delay={0.24}>
          <p className="font-display mt-8 text-[clamp(1.75rem,4.6vw,3.4rem)] font-medium leading-[1.05] tracking-tight">
            <span className="bg-lime px-2 text-ink">PARTNRA finds them.</span>
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
