import { Container } from "./ui/Container";
import { SectionLabel } from "./ui/SectionLabel";
import { Button } from "./ui/Button";
import { Reveal } from "./ui/Reveal";
import { AffiliateFlow } from "./AffiliateFlow";
import { HeroProcessFlow } from "./HeroProcessFlow";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-32 pb-20 md:pt-44 md:pb-28">
      <Container>
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-[1.35fr_1fr] lg:gap-10">
          <div>
            <Reveal>
              <SectionLabel>AI Affiliate Recruitment for E-commerce</SectionLabel>
            </Reveal>

            <Reveal delay={0.08}>
              <h1 className="font-display mt-6 text-[clamp(2.5rem,9vw,7.2rem)] font-medium leading-[0.98] tracking-tight text-ink">
                Find the affiliates
                <br />
                already selling
                <br />
                your competitors.
              </h1>
            </Reveal>

            <Reveal delay={0.16}>
              <p className="font-display mt-4 text-[clamp(1.5rem,3.6vw,2.75rem)] font-medium leading-[1.05] tracking-tight text-ink/40">
                Then recruit them for your brand.
              </p>
            </Reveal>

            <HeroProcessFlow />

            <Reveal delay={0.66}>
              <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
                <Button href="#audit" variant="secondary" size="lg" className="w-full sm:w-auto">
                  Find my affiliates
                </Button>
                <Button href="#how-it-works" variant="ghost" arrow={false}>
                  See how it works
                </Button>
              </div>
            </Reveal>

            <Reveal delay={0.76}>
              <p className="mt-8 text-sm font-medium text-ink/55">
                No new affiliate network. Keep your existing programme.
              </p>
            </Reveal>
          </div>

          <div className="flex items-start justify-start lg:justify-end lg:pt-4">
            <Reveal delay={0.3}>
              <AffiliateFlow />
            </Reveal>
          </div>
        </div>
      </Container>
    </section>
  );
}
