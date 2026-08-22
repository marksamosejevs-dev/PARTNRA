import { Container } from "./ui/Container";
import { Reveal, RevealGroup, RevealItem } from "./ui/Reveal";
import { SignalCard } from "./ui/SignalCard";

const SIGNALS = [
  { label: "Discount codes", value: "JAMES10" },
  { label: "Affiliate links", value: "?ref=james" },
  { label: "Competitor partnerships", value: "3 detected" },
  { label: "Commercial content", value: "Repeated product reviews" },
  { label: "Audience geo", value: "78% UK" },
  { label: "Recent activity", value: "Competitor promoted 8 days ago" },
];

export function NotJustInfluencers() {
  return (
    <section id="product" className="scroll-mt-24 py-24 md:py-36">
      <Container>
        <Reveal>
          <h2 className="font-display max-w-2xl text-[clamp(2rem,5.5vw,4rem)] font-medium leading-[1.03] tracking-tight">
            Not just influencers.
            <br />
            <span className="text-ink/35">People who already sell.</span>
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-ink/60 md:text-xl">
            A creator with 500,000 followers is not automatically a valuable affiliate.
            PARTNRA looks for evidence that someone already knows how to promote and
            monetise products.
          </p>
        </Reveal>

        <RevealGroup className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SIGNALS.map((signal) => (
            <RevealItem key={signal.label}>
              <SignalCard label={signal.label} value={signal.value} />
            </RevealItem>
          ))}
        </RevealGroup>
      </Container>
    </section>
  );
}
