import { Container } from "./ui/Container";
import { SectionLabel } from "./ui/SectionLabel";
import { Button } from "./ui/Button";
import { Reveal } from "./ui/Reveal";
import { AffiliateFlow } from "./AffiliateFlow";
import { DiscoveryScanner } from "./DiscoveryScanner";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-28 pb-12 md:pt-32 md:pb-12">
      <Container>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.35fr_1fr] lg:gap-10">
          <div>
            <Reveal>
              <SectionLabel>AI Partner Discovery for E-commerce</SectionLabel>
            </Reveal>

            <Reveal delay={0.08}>
              <h1 className="font-display mt-4 max-w-2xl text-[clamp(2.25rem,3.6vw,3.5rem)] font-medium leading-[1.08] tracking-tight text-ink">
                Tell PARTNRA what you sell.
                <br />
                We&rsquo;ll find the people
                <br />
                who can sell it.
              </h1>
            </Reveal>

            <Reveal delay={0.16}>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-ink/55 md:text-lg">
                PARTNRA discovers potential partners across the web, identifies who already
                promotes similar brands, ranks the strongest opportunities and helps you turn
                them into active partners.
              </p>
            </Reveal>

            <Reveal delay={0.24}>
              <div className="mt-6 flex flex-col items-start gap-2.5">
                <Button href="#pricing" variant="secondary" size="lg">
                  Choose your plan
                </Button>
                <p className="text-sm text-ink/45">
                  Plans from $49/month. Cancel anytime.
                </p>
              </div>
            </Reveal>
          </div>

          <div className="flex items-start justify-start lg:justify-end lg:pt-2">
            <Reveal delay={0.3}>
              <AffiliateFlow />
            </Reveal>
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-4xl md:mt-10">
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
