import { Container } from "./ui/Container";
import { Reveal } from "./ui/Reveal";

const LINES = [
  "You sell products.",
  "Your competitors have affiliates.",
  "PARTNRA finds them.",
  "Alex helps recruit them.",
];

export function SimplestExplanation() {
  return (
    <section className="border-t border-ink/10 py-28 md:py-40">
      <Container>
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          {LINES.map((line, i) => (
            <div key={line} className="contents">
              <Reveal delay={i * 0.12}>
                <p
                  className={
                    "font-display text-[clamp(1.6rem,5.5vw,3.4rem)] font-medium leading-[1.1] tracking-tight " +
                    (i === LINES.length - 1 ? "" : "text-ink/35")
                  }
                >
                  {i === LINES.length - 2 ? (
                    <span className="bg-lime px-2 text-ink">{line}</span>
                  ) : (
                    line
                  )}
                </p>
              </Reveal>
              {i < LINES.length - 1 && (
                <Reveal delay={i * 0.12 + 0.06} className="my-3 text-ink/25 md:my-5">
                  ↓
                </Reveal>
              )}
            </div>
          ))}
          <Reveal delay={LINES.length * 0.12} className="mt-10 text-sm text-ink/35">
            That&rsquo;s it.
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
