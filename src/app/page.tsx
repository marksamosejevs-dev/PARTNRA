import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { MarqueeStrip } from "@/components/MarqueeStrip";
import { SimpleExample } from "@/components/SimpleExample";
import { ManualVsPartnra } from "@/components/ManualVsPartnra";
import { Problem } from "@/components/Problem";
import { NotJustInfluencers } from "@/components/NotJustInfluencers";
import { CommercialIntent } from "@/components/CommercialIntent";
import { CreatorComparison } from "@/components/CreatorComparison";
import { CompetitorIntelligence } from "@/components/CompetitorIntelligence";
import { AffiliateProfile } from "@/components/AffiliateProfile";
import { WhyNotInfluencerDB } from "@/components/WhyNotInfluencerDB";
import { WhyNotAwin } from "@/components/WhyNotAwin";
import { AlexSection } from "@/components/AlexSection";
import { WhyNotHireManager } from "@/components/WhyNotHireManager";
import { HowItWorks } from "@/components/HowItWorks";
import { OutreachDemo } from "@/components/OutreachDemo";
import { Benefits } from "@/components/Benefits";
import { SimplestExplanation } from "@/components/SimplestExplanation";
import { ROI } from "@/components/ROI";
import { AuditForm } from "@/components/AuditForm";
import { Pilot } from "@/components/Pilot";
import { Roadmap } from "@/components/Roadmap";
import { Vision } from "@/components/Vision";
import { FinalCTA } from "@/components/FinalCTA";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <MarqueeStrip />
        <SimpleExample />
        <ManualVsPartnra />
        <Problem />
        <NotJustInfluencers />
        <CommercialIntent />
        <CreatorComparison />
        <CompetitorIntelligence />
        <AffiliateProfile />
        <WhyNotInfluencerDB />
        <WhyNotAwin />
        <AlexSection />
        <WhyNotHireManager />
        <HowItWorks />
        <OutreachDemo />
        <Benefits />
        <SimplestExplanation />
        <ROI />
        <AuditForm />
        <Pilot />
        <Roadmap />
        <Vision />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
