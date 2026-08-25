import { Container } from "./ui/Container";
import { Reveal } from "./ui/Reveal";
import { Button } from "./ui/Button";

export function FinalCTA() {
  return (
    <section className="py-28 md:py-40">
      <Container>
        <div className="mx-auto max-w-4xl text-center">
          <Reveal>
            <h2 className="font-display text-[clamp(2.2rem,7vw,5.4rem)] font-medium leading-[1.03] tracking-tight">
              Your next 100 partners are already out there.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-6 text-xl text-ink/50 md:text-2xl">
              Alex knows where to look.
            </p>
          </Reveal>
          <Reveal delay={0.2} className="mt-12 flex flex-col items-center gap-3">
            <Button href="#pricing" variant="secondary" size="lg">
              Choose your plan
            </Button>
            <p className="text-sm text-ink/40">Plans from $49/month. Cancel anytime.</p>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
