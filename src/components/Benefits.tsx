import { Container } from "./ui/Container";
import { SectionLabel } from "./ui/SectionLabel";
import { Reveal, RevealGroup, RevealItem } from "./ui/Reveal";

const BENEFITS = [
  {
    n: "01",
    title: "Find",
    headline: "Find people already promoting your competitors.",
    detail: "Stop starting affiliate recruitment from zero.",
  },
  {
    n: "02",
    title: "Prove",
    headline: "See why each prospect matters.",
    detail: "Look at commercial signals instead of follower counts alone.",
  },
  {
    n: "03",
    title: "Prioritise",
    headline: "Know who to contact first.",
    detail: "Affiliate scoring separates strong prospects from noise.",
  },
  {
    n: "04",
    title: "Contact",
    headline: "Find available business contact information.",
    detail: "Reduce manual prospect research.",
  },
  {
    n: "05",
    title: "Personalise",
    headline: "Write outreach based on what they actually promote.",
    detail: "No generic “Hi, we love your content.”",
  },
  {
    n: "06",
    title: "Follow up",
    headline: "Keep recruitment moving.",
    detail: "Reduce forgotten prospects and spreadsheet chaos.",
  },
  {
    n: "07",
    title: "Recruit",
    headline: "Turn competitor affiliates into your partners.",
    detail: "Then manage them using your existing affiliate infrastructure.",
  },
];

export function Benefits() {
  return (
    <section className="py-24 md:py-36">
      <Container>
        <Reveal>
          <SectionLabel>What PARTNRA does</SectionLabel>
        </Reveal>

        <RevealGroup className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-ink/10 bg-ink/10 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => (
            <RevealItem key={b.n}>
              <div className="flex h-full flex-col bg-paper p-7 md:p-8">
                <div className="flex items-center gap-3">
                  <span className="font-mono-label text-xs text-ink/30">{b.n}</span>
                  <span className="font-mono-label text-xs font-semibold uppercase tracking-[0.16em] text-ink/50">
                    {b.title}
                  </span>
                </div>
                <h3 className="font-display mt-4 text-xl font-medium leading-snug tracking-tight md:text-2xl">
                  {b.headline}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-ink/50 md:text-base">
                  {b.detail}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </Container>
    </section>
  );
}
