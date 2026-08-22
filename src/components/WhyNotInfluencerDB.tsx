import { Container } from "./ui/Container";
import { Reveal } from "./ui/Reveal";

export function WhyNotInfluencerDB() {
  return (
    <section className="border-t border-ink/10 bg-surface py-24 md:py-32">
      <Container>
        <Reveal>
          <h2 className="font-display max-w-2xl text-[clamp(1.9rem,5vw,3.4rem)] font-medium leading-[1.05] tracking-tight">
            Because followers aren&rsquo;t the point.
          </h2>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-2">
          <Reveal delay={0.08}>
            <div className="rounded-3xl border border-ink/10 bg-paper p-8 md:p-10">
              <div className="font-mono-label text-xs font-semibold uppercase tracking-[0.16em] text-ink/40">
                Traditional creator databases answer
              </div>
              <div className="font-display mt-4 text-2xl font-medium leading-tight tracking-tight text-ink/50 md:text-3xl">
                &ldquo;Who has an audience?&rdquo;
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.16}>
            <div className="rounded-3xl border border-lime bg-ink p-8 text-paper md:p-10">
              <div className="font-mono-label text-xs font-semibold uppercase tracking-[0.16em] text-lime">
                PARTNRA is designed to answer
              </div>
              <div className="font-display mt-4 text-2xl font-medium leading-tight tracking-tight md:text-3xl">
                &ldquo;Who is already selling products like mine?&rdquo;
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.24}>
          <p className="font-display mt-16 text-[clamp(1.8rem,4.8vw,3.4rem)] font-medium leading-[1.05] tracking-tight">
            Audience <span className="text-ink/30">≠</span> commercial intent.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
