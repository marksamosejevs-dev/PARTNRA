import { Container } from "./ui/Container";
import { SectionLabel } from "./ui/SectionLabel";
import { Button } from "./ui/Button";
import { Reveal } from "./ui/Reveal";
import { AffiliateFlow } from "./AffiliateFlow";
import { DiscoveryScanner } from "./DiscoveryScanner";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-20 pb-12 md:pt-16 md:pb-12">
      <Container>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.35fr_1fr] lg:gap-10">
          <div>
            <Reveal>
              <SectionLabel>AI Affiliate Recruitment for E-commerce</SectionLabel>
            </Reveal>

            <Reveal delay={0.08}>
              <h1 className="font-display mt-3 max-w-2xl text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-[1.05] tracking-tight text-ink">
                Find the affiliates already promoting your competitors.
              </h1>
            </Reveal>

            <Reveal delay={0.16}>
              <p className="mt-3 max-w-xl text-base leading-relaxed text-ink/55 md:text-lg">
                Enter a competitor. PARTNRA searches public web signals to find creators,
                publishers, promo codes and affiliate placements already connected to them.
              </p>
            </Reveal>
          </div>

          <div className="flex items-start justify-start lg:justify-end lg:pt-4">
            <Reveal delay={0.3}>
              <AffiliateFlow />
            </Reveal>
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-4xl md:mt-10">
          <Reveal delay={0.4}>
            <DiscoveryScanner />
          </Reveal>

          <Reveal delay={0.5}>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-center">
              <p className="text-sm font-medium text-ink/55">
                Public web signals only. No credit card required.
              </p>
              <Button href="#how-it-works" variant="ghost" arrow={false}>
                See how it works
              </Button>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
