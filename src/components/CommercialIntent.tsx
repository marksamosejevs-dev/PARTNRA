import { Container } from "./ui/Container";
import { Reveal, RevealGroup, RevealItem } from "./ui/Reveal";

const SIGNALS = [
  "Competitor affiliate links",
  "Discount codes",
  "Number of relevant partnerships",
  "Recent commercial posts",
  "Product-category relevance",
  "Audience geography",
  "Commercial contact availability",
  "Frequency of promotions",
];

export function CommercialIntent() {
  return (
    <section className="bg-ink py-24 text-paper md:py-36">
      <Container>
        <Reveal>
          <h2 className="font-display max-w-3xl text-[clamp(2.1rem,6vw,4.6rem)] font-medium leading-[1.02] tracking-tight">
            Followers don&rsquo;t sell products.
            <br />
            <span className="text-lime">Commercial intent does.</span>
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-paper/55 md:text-xl">
            PARTNRA prioritises behavioural evidence instead of vanity metrics. Every
            prospect is analysed for signals that suggest they already know how to sell.
          </p>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-10">
          <RevealGroup className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2" stagger={0.05}>
            {SIGNALS.map((signal) => (
              <RevealItem key={signal}>
                <div className="flex items-center gap-3 border-b border-white/10 py-3">
                  <span className="text-lime">✓</span>
                  <span className="text-[15px] text-paper/75 md:text-base">{signal}</span>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>

          <Reveal delay={0.15} className="flex justify-center text-paper/25">
            <span className="font-display text-3xl">→</span>
          </Reveal>

          <Reveal delay={0.2} className="flex justify-center lg:justify-start">
            <div className="inline-flex flex-col items-center gap-2 rounded-3xl border border-lime/30 bg-lime/[0.06] px-10 py-8 text-center">
              <span className="font-mono-label text-xs font-semibold uppercase tracking-[0.2em] text-lime">
                PARTNRA fit
              </span>
              <span className="font-display text-5xl font-medium tracking-tight text-paper">
                0–100
              </span>
              <span className="max-w-[16rem] text-sm text-paper/45">
                A single number that ranks who is worth recruiting first.
              </span>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
