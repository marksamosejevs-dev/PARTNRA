import { Container } from "./ui/Container";
import { SectionLabel } from "./ui/SectionLabel";
import { Button } from "./ui/Button";
import { Reveal } from "./ui/Reveal";
import { AffiliateFlow } from "./AffiliateFlow";
import { DiscoveryScanner } from "./DiscoveryScanner";

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
              <h1 className="font-display mt-6 text-[clamp(2.25rem,7.5vw,5.8rem)] font-medium leading-[0.98] tracking-tight text-ink">
                Find the affiliates
                <br />
                already promoting
                <br />
                your competitors.
              </h1>
            </Reveal>

            <Reveal delay={0.16}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink/55 md:text-xl">
                Enter a competitor. PARTNRA searches public web signals to find creators,
                publishers, promo codes and affiliate placements already connected to them.
              </p>
            </Reveal>

            <Reveal delay={0.24}>
              <div className="mt-9 flex flex-col items-start gap-3">
                <Button href="#pricing" variant="secondary" size="lg">
                  Choose your plan
                </Button>
                <p className="text-sm text-ink/45">
                  Plans from $49/month. Cancel anytime.
                </p>
              </div>
            </Reveal>
          </div>

          <div className="flex items-start justify-start lg:justify-end lg:pt-4">
            <Reveal delay={0.3}>
              <AffiliateFlow />
            </Reveal>
          </div>
        </div>

        <div className="mx-auto mt-14 max-w-4xl md:mt-20">
          <Reveal delay={0.4}>
            <DiscoveryScanner />
          </Reveal>

          <Reveal delay={0.5}>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-center">
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
