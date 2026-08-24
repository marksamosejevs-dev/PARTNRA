import { Container } from "./ui/Container";
import { SectionLabel } from "./ui/SectionLabel";
import { Reveal } from "./ui/Reveal";
import { Button } from "./ui/Button";

const INCLUDES = [
  "Competitor analysis",
  "Up to 250 qualified prospects",
  "Affiliate scoring",
  "Contact discovery",
  "Competitor promotion evidence",
  "Personalised outreach drafts",
  "Recruitment pipeline",
];

export function Pilot() {
  return (
    <section id="pilot" className="scroll-mt-24 border-t border-ink/10 py-24 md:py-36">
      <Container>
        <Reveal>
          <SectionLabel>Founding brands / Early access</SectionLabel>
        </Reveal>

        <Reveal delay={0.06}>
          <h2 className="font-display mt-6 max-w-2xl text-[clamp(2.1rem,5.5vw,4.2rem)] font-medium leading-[1.03] tracking-tight">
            Find your first competitor affiliates with PARTNRA.
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink/60 md:text-xl">
            Get early access to competitor-based affiliate discovery and help shape the
            platform.
          </p>
        </Reveal>

        <Reveal delay={0.14}>
          <div className="mt-14 grid grid-cols-1 overflow-hidden rounded-3xl border border-ink/10 lg:grid-cols-[1fr_1.3fr]">
            <div className="flex flex-col justify-between bg-ink p-8 text-paper md:p-10">
              <div>
                <div className="font-mono-label text-xs font-semibold uppercase tracking-[0.16em] text-lime">
                  PARTNRA pilot
                </div>
                <div className="font-display mt-4 flex items-baseline gap-2">
                  <span className="text-5xl font-medium tracking-tight md:text-6xl">
                    £199
                  </span>
                </div>
                <div className="mt-1 text-sm text-paper/40">One-time</div>
              </div>
              <div className="mt-10">
                <Button href="#audit" variant="secondary">
                  Get early access
                </Button>
              </div>
            </div>

            <div className="bg-paper p-8 md:p-10">
              <div className="font-mono-label text-xs font-semibold uppercase tracking-[0.16em] text-ink/40">
                Includes
              </div>
              <ul className="mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                {INCLUDES.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-base text-ink/75">
                    <span className="text-lime">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <p className="mt-8 max-w-xl text-sm text-ink/40">
            Initially built for supplements, wellness, beauty, fitness and DTC brands.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
