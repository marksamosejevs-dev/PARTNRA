import { Container } from "./ui/Container";
import { SectionLabel } from "./ui/SectionLabel";
import { Reveal, RevealGroup, RevealItem } from "./ui/Reveal";
import { EvidenceCard } from "./ui/EvidenceCard";
import type { Candidate } from "@/lib/discovery/types";

const EXAMPLE_CANDIDATES: Candidate[] = [
  {
    name: "Marcus Bell",
    type: "Creator",
    platform: "YouTube, TikTok",
    profileUrl: "https://youtube.com/@marcusbell",
    sourceUrl: "https://youtube.com/watch?v=example",
    sourceCount: 2,
    evidenceType: "Promo code",
    evidence: "Uses code MARCUS20 when recommending Nutra-Labs supplements in a review video, and again in a TikTok caption.",
    signalStrength: "strong",
    verified: true,
    promoCode: "MARCUS20",
    contact: "marcus@creatorpartnerships.example",
    contactStatus: "found",
    confidence: 94,
    reason: "Named creator with a personalized discount code, corroborated across two platforms.",
  },
  {
    name: "The Wellness Edit",
    type: "Publisher",
    platform: "Web",
    profileUrl: "https://thewellnessedit.example.com",
    sourceUrl: "https://thewellnessedit.example.com/best-supplements-2026",
    sourceCount: 1,
    evidenceType: "Affiliate link",
    evidence: "\"Best supplements\" roundup links to Nutra-Labs through a tagged affiliate URL.",
    signalStrength: "strong",
    verified: true,
    promoCode: null,
    contact: null,
    contactStatus: "not_found",
    confidence: 85,
    reason: "Outbound link carries an affiliate tracking parameter.",
  },
  {
    name: "Priya Anand",
    type: "Creator",
    platform: "Instagram",
    profileUrl: "https://instagram.com/priyaanand",
    sourceUrl: "https://instagram.com/p/example",
    sourceCount: 1,
    evidenceType: "Ambassador",
    evidence: "Bio links to a dedicated Nutra-Labs discount page and discloses a paid partnership.",
    signalStrength: "strong",
    verified: true,
    promoCode: null,
    contact: null,
    contactStatus: "not_attempted",
    confidence: 79,
    reason: "Disclosed partnership plus a dedicated discount page.",
  },
];

export function ExampleResults() {
  return (
    <section id="results" className="scroll-mt-24 border-t border-ink/10 bg-surface py-24 md:py-36">
      <Container>
        <Reveal>
          <SectionLabel>Example report</SectionLabel>
        </Reveal>

        <Reveal delay={0.06}>
          <h2 className="font-display mt-6 max-w-3xl text-[clamp(2rem,5.5vw,4.2rem)] font-medium leading-[1.03] tracking-tight">
            See who is already promoting them.
          </h2>
        </Reveal>

        <Reveal delay={0.12}>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink/60 md:text-xl">
            PARTNRA doesn&rsquo;t just give you a creator list. It shows why each result matters.
          </p>
        </Reveal>

        <Reveal delay={0.2}>
          <div className="mt-14 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-paper px-6 py-4">
            <span className="font-mono-label text-sm font-semibold uppercase tracking-[0.14em] text-ink/70">
              nutra-labs.co.uk
            </span>
            <span className="font-mono-label text-xs font-semibold uppercase tracking-[0.16em] text-ink/40">
              Partner signals detected — example data
            </span>
          </div>
        </Reveal>

        <RevealGroup className="mt-6 flex flex-col gap-4">
          {EXAMPLE_CANDIDATES.map((candidate) => (
            <RevealItem key={candidate.sourceUrl}>
              <EvidenceCard candidate={candidate} demo />
            </RevealItem>
          ))}
        </RevealGroup>
      </Container>
    </section>
  );
}
