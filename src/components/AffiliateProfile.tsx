import { Container } from "./ui/Container";
import { Reveal } from "./ui/Reveal";
import { Button } from "./ui/Button";

const SIGNALS = [
  "Competitor affiliate link",
  "Multiple supplement partnerships",
  "Recent promotion",
  "Relevant audience",
  "Business contact available",
];

const GHOST_PROFILES = [
  { name: "Sarah Whitmore", score: 88 },
  { name: "Daniel Osei", score: 81 },
];

export function AffiliateProfile() {
  return (
    <section className="overflow-hidden py-24 md:py-36">
      <Container>
        <div className="relative">
          <div className="pointer-events-none absolute inset-0 hidden md:block" aria-hidden="true">
            {GHOST_PROFILES.map((g, i) => (
              <div
                key={g.name}
                className="absolute top-0 h-full w-full rounded-[2rem] border border-ink/8 bg-surface/40"
                style={{
                  transform: `translate(${(i + 1) * 22}px, ${(i + 1) * 18}px)`,
                  opacity: 0.5 - i * 0.15,
                }}
              />
            ))}
          </div>

          <Reveal className="relative">
            <div className="rounded-[2rem] border border-ink/10 bg-paper p-8 shadow-[0_30px_80px_-40px_rgba(10,10,10,0.25)] md:p-12">
              <div className="flex flex-wrap items-start justify-between gap-8">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-2 rounded-full bg-lime/20 px-3 py-1">
                      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-lime" />
                      <span className="font-mono-label text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/70">
                        High intent
                      </span>
                    </div>
                    <div className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1">
                      <span className="font-mono-label text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/50">
                        Affiliate creator
                      </span>
                    </div>
                  </div>
                  <h3 className="font-display mt-4 text-4xl font-medium tracking-tight md:text-5xl">
                    James Carter
                  </h3>
                  <div className="mt-2 text-sm text-ink/45 md:text-base">
                    United Kingdom · YouTube · Instagram
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-mono-label text-xs font-semibold uppercase tracking-[0.16em] text-ink/40">
                    PARTNRA fit
                  </div>
                  <div className="font-display mt-1 text-6xl font-medium tracking-tight md:text-7xl">
                    94<span className="text-2xl text-ink/30 md:text-3xl">/100</span>
                  </div>
                </div>
              </div>

              <div className="mt-10 grid grid-cols-2 gap-6 border-y border-ink/10 py-8 md:grid-cols-4">
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.1em] text-ink/40">
                    Estimated UK audience
                  </div>
                  <div className="font-display mt-1.5 text-2xl font-medium tracking-tight">
                    78%
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.1em] text-ink/40">
                    Currently promotes
                  </div>
                  <div className="mt-1.5 text-base text-ink/80">AG1, Huel, MyProtein</div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.1em] text-ink/40">
                    Detected codes
                  </div>
                  <div className="font-mono-label mt-1.5 text-base text-ink/80">
                    JAMES10, JC15
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.1em] text-ink/40">
                    Platforms
                  </div>
                  <div className="mt-1.5 text-base text-ink/80">YouTube, Instagram</div>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                {SIGNALS.map((s) => (
                  <div
                    key={s}
                    className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-surface/60 px-4 py-2 text-sm text-ink/70"
                  >
                    <span className="text-lime">✓</span>
                    {s}
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <div className="font-mono-label text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">
                  Why PARTNRA found this
                </div>
                <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/60">
                  Already promotes three supplement brands in your category, with a
                  UK-majority audience and a business email on file.
                </p>
              </div>

              <div className="mt-8">
                <Button href="#audit" variant="secondary">
                  Recruit James
                </Button>
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
