import { Container } from "./ui/Container";
import { Reveal } from "./ui/Reveal";

const MANUAL = [
  "Competitor research",
  "Creator search",
  "Commercial verification",
  "Contact search",
  "Spreadsheets",
  "Generic outreach",
  "Follow-ups",
  "Pipeline maintenance",
];

const PARTNRA = [
  "Continuous discovery",
  "Competitor intelligence",
  "AI qualification",
  "Contact research",
  "Personalised recruitment",
  "Organised pipeline",
  "Human approvals",
];

export function ROI() {
  return (
    <section className="border-t border-ink/10 bg-surface py-24 md:py-32">
      <Container>
        <Reveal>
          <h2 className="font-display max-w-2xl text-[clamp(1.9rem,5vw,3.2rem)] font-medium leading-[1.05] tracking-tight">
            Same goal. Different workload.
          </h2>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
          <Reveal delay={0.08}>
            <div className="h-full rounded-3xl border border-ink/10 bg-paper/60 p-8 md:p-10">
              <div className="font-mono-label text-xs font-semibold uppercase tracking-[0.16em] text-ink/40">
                Manual
              </div>
              <ul className="mt-6 flex flex-col gap-3">
                {MANUAL.map((item) => (
                  <li
                    key={item}
                    className="border-b border-ink/8 pb-3 text-base text-ink/45 last:border-none"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={0.16}>
            <div className="h-full rounded-3xl border border-ink/15 bg-ink p-8 text-paper md:p-10">
              <div className="font-mono-label text-xs font-semibold uppercase tracking-[0.16em] text-lime">
                PARTNRA
              </div>
              <ul className="mt-6 flex flex-col gap-3">
                {PARTNRA.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-3 border-b border-white/10 pb-3 text-base text-paper/85 last:border-none"
                  >
                    <span className="text-lime">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
