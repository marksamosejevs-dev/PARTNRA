import { Container } from "./ui/Container";
import { SectionLabel } from "./ui/SectionLabel";
import { Reveal } from "./ui/Reveal";

export function MeetAlex() {
  return (
    <div className="pt-24 pb-16 md:pt-32 md:pb-20">
      <Container>
        <Reveal>
          <SectionLabel tone="paper">04 / AI Affiliate Manager</SectionLabel>
        </Reveal>

        <Reveal delay={0.06}>
          <h2 className="font-display mt-6 text-[clamp(2.4rem,7vw,5.5rem)] font-medium leading-[1] tracking-tight text-paper">
            Meet Alex.
          </h2>
        </Reveal>

        <Reveal delay={0.12}>
          <p className="font-display mt-2 text-[clamp(1.4rem,3.4vw,2.3rem)] font-medium leading-[1.1] tracking-tight text-paper/40">
            Your AI Affiliate Manager.
          </p>
        </Reveal>

        <Reveal delay={0.2}>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-paper/60 md:text-xl">
            Tell Alex what you sell. Alex researches your market, finds people already
            promoting competing products, qualifies them and prepares recruitment
            opportunities.
          </p>
        </Reveal>

        <Reveal delay={0.28}>
          <div className="mt-8 inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2">
            <span className="pulse-dot h-2 w-2 rounded-full bg-lime" />
            <span className="font-mono-label text-xs font-semibold uppercase tracking-[0.16em] text-paper/70">
              Alex / Working
            </span>
          </div>
        </Reveal>
      </Container>
    </div>
  );
}
