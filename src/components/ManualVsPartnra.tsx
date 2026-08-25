import { Container } from "./ui/Container";
import { Reveal, RevealGroup, RevealItem } from "./ui/Reveal";

const WITHOUT = [
  "Research competitors",
  "Search Google",
  "Search Instagram",
  "Search TikTok",
  "Search YouTube",
  "Find creators",
  "Check whether they actually promote products",
  "Find affiliate links",
  "Find discount codes",
  "Find business email",
  "Build spreadsheet",
  "Write outreach",
  "Remember follow-ups",
  "Repeat",
];

const WITH = [
  { text: "Enter yourstore.com", mono: true },
  { text: "Alex researches the market." },
  { text: "427 potential partners found." },
  { text: "37 high-intent prospects." },
  { text: "Contacts identified." },
  { text: "Personalised recruitment prepared." },
  { text: "You choose who to recruit.", strong: true },
];

export function ManualVsPartnra() {
  return (
    <section className="border-t border-ink/10 bg-surface py-24 md:py-32">
      <Container>
        <Reveal>
          <h2 className="font-display max-w-2xl text-[clamp(1.9rem,4.5vw,3.2rem)] font-medium leading-[1.05] tracking-tight">
            The same outcome. A very different path.
          </h2>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-10">
          <div>
            <div className="font-mono-label text-xs font-semibold uppercase tracking-[0.2em] text-ink/40">
              Without PARTNRA
            </div>
            <RevealGroup className="mt-6 flex flex-col" stagger={0.04}>
              {WITHOUT.map((step, i) => (
                <RevealItem key={step}>
                  <div className="flex items-center gap-4 border-b border-ink/8 py-3 text-ink/45">
                    <span className="font-mono-label w-6 text-xs text-ink/25">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[15px] leading-snug md:text-base">{step}</span>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>

          <div>
            <div className="font-mono-label text-xs font-semibold uppercase tracking-[0.2em] text-ink">
              With PARTNRA
            </div>
            <RevealGroup className="mt-6 flex flex-col" stagger={0.08}>
              {WITH.map((step, i) => (
                <RevealItem key={step.text}>
                  <div className="flex items-center gap-4 border-b border-ink/15 py-5">
                    <span className="font-mono-label flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-lime">
                      {i + 1}
                    </span>
                    <span
                      className={
                        step.mono
                          ? "font-mono-label text-base text-ink md:text-lg"
                          : step.strong
                            ? "font-display text-lg font-medium tracking-tight text-ink md:text-2xl"
                            : "text-base text-ink/80 md:text-lg"
                      }
                    >
                      {step.text}
                    </span>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </div>
      </Container>
    </section>
  );
}
