import { Container } from "./ui/Container";
import { Reveal } from "./ui/Reveal";

const PARTNRA_STAGES = ["Find", "Research", "Qualify", "Contact", "Recruit"];
const PLATFORM_STAGES = ["Track", "Attribute", "Calculate", "Pay"];

export function WhyNotAwin() {
  return (
    <section className="py-24 md:py-36">
      <Container>
        <Reveal>
          <h2 className="font-display max-w-2xl text-[clamp(2rem,5.5vw,4.2rem)] font-medium leading-[1.03] tracking-tight">
            Tracking is solved.
            <br />
            <span className="text-ink/35">Recruitment isn&rsquo;t.</span>
          </h2>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="mt-16 overflow-hidden rounded-3xl border border-ink/10">
            <div className="bg-lime px-8 py-8 md:px-12 md:py-10">
              <div className="font-mono-label mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">
                PARTNRA
              </div>
              <div className="flex flex-wrap items-center gap-3 md:gap-4">
                {PARTNRA_STAGES.map((stage, i) => (
                  <div key={stage} className="flex items-center gap-3 md:gap-4">
                    <span className="font-display text-xl font-medium tracking-tight text-ink md:text-3xl">
                      {stage}
                    </span>
                    {i < PARTNRA_STAGES.length - 1 && (
                      <span className="text-ink/40">→</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-center bg-ink py-3">
              <span className="text-lime">↓</span>
            </div>

            <div className="bg-ink px-8 py-8 text-paper md:px-12 md:py-10">
              <div className="font-mono-label mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-paper/40">
                Your existing affiliate platform
              </div>
              <div className="flex flex-wrap items-center gap-3 md:gap-4">
                {PLATFORM_STAGES.map((stage, i) => (
                  <div key={stage} className="flex items-center gap-3 md:gap-4">
                    <span className="font-display text-xl font-medium tracking-tight text-paper/70 md:text-3xl">
                      {stage}
                    </span>
                    {i < PLATFORM_STAGES.length - 1 && (
                      <span className="text-paper/25">→</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <p className="font-display mt-14 max-w-2xl text-[clamp(1.5rem,3.8vw,2.4rem)] font-medium leading-[1.15] tracking-tight">
            Keep your existing platform.
            <br />
            PARTNRA fills it with partners.
          </p>
        </Reveal>

        <Reveal delay={0.28}>
          <p className="mt-8 max-w-xl text-sm leading-relaxed text-ink/40">
            Designed to complement affiliate platforms such as Awin, Impact, Shopify
            Collabs and Refersion. PARTNRA is not affiliated with, endorsed by, or an
            official partner of these platforms.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
