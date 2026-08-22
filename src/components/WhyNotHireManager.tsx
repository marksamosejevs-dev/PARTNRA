import { Container } from "./ui/Container";
import { Reveal } from "./ui/Reveal";

const ALEX_HANDLES = [
  "Discovery",
  "Competitor research",
  "Prospect research",
  "Commercial-intent scoring",
  "Contact discovery",
  "Outreach preparation",
  "Follow-up assistance",
  "Pipeline organisation",
];

const YOU_HANDLE = ["Strategy", "Relationships", "Special commercial terms", "Final approvals"];

export function WhyNotHireManager() {
  return (
    <section className="py-24 md:py-36">
      <Container>
        <Reveal>
          <h2 className="font-display max-w-2xl text-[clamp(2rem,5.5vw,4rem)] font-medium leading-[1.05] tracking-tight">
            Give your team an AI researcher.
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-ink/60 md:text-xl">
            Affiliate teams spend significant time researching prospects, checking
            profiles, finding contacts, preparing outreach and maintaining spreadsheets.
            Alex handles repetitive research so people can focus on relationships,
            strategy and decisions.
          </p>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-2">
          <Reveal delay={0.16}>
            <div className="rounded-3xl border border-ink/10 bg-ink p-8 text-paper md:p-10">
              <div className="font-mono-label text-xs font-semibold uppercase tracking-[0.16em] text-lime">
                Alex handles
              </div>
              <ul className="mt-6 flex flex-col gap-3.5">
                {ALEX_HANDLES.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-base text-paper/80">
                    <span className="text-lime">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={0.22}>
            <div className="rounded-3xl border border-ink/10 bg-surface p-8 md:p-10">
              <div className="font-mono-label text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">
                You handle
              </div>
              <ul className="mt-6 flex flex-col gap-3.5">
                {YOU_HANDLE.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-base text-ink/75">
                    <span className="text-ink/30">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.3}>
          <p className="font-display mt-16 text-[clamp(1.8rem,4.8vw,3.2rem)] font-medium leading-[1.1] tracking-tight">
            Less searching. <span className="text-ink/35">More recruiting.</span>
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
