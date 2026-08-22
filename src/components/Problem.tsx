import { Container } from "./ui/Container";
import { SectionLabel } from "./ui/SectionLabel";
import { Reveal } from "./ui/Reveal";

export function Problem() {
  return (
    <section className="py-24 md:py-36">
      <Container>
        <Reveal>
          <SectionLabel>The problem</SectionLabel>
        </Reveal>

        <Reveal delay={0.06}>
          <h2 className="font-display mt-6 max-w-4xl text-[clamp(2.2rem,6.5vw,5rem)] font-medium leading-[1.02] tracking-tight">
            Tracking affiliates is easy.
            <br />
            <span className="text-ink/35">Finding good ones isn&rsquo;t.</span>
          </h2>
        </Reveal>

        <Reveal delay={0.14}>
          <div className="mt-12 max-w-xl space-y-4 text-lg leading-relaxed text-ink/60 md:text-xl">
            <p>
              Affiliate platforms can track clicks, sales and commissions once someone joins
              your programme.
            </p>
            <p className="font-medium text-ink">
              But somebody still needs to find them first.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <p className="font-display mt-14 text-[clamp(1.75rem,4.6vw,3.4rem)] font-medium leading-[1.05] tracking-tight">
            That&rsquo;s <span className="bg-lime px-2">PARTNRA</span>.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
