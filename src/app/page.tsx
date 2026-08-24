import { Header } from "@/components/Header";
import { CheckoutCancelledNotice } from "@/components/CheckoutCancelledNotice";
import { Hero } from "@/components/Hero";
import { MarqueeStrip } from "@/components/MarqueeStrip";
import { SimpleExample } from "@/components/SimpleExample";
import { ManualVsPartnra } from "@/components/ManualVsPartnra";
import { Problem } from "@/components/Problem";
import { NotJustInfluencers } from "@/components/NotJustInfluencers";
import { CommercialIntent } from "@/components/CommercialIntent";
import { CreatorComparison } from "@/components/CreatorComparison";
import { CompetitorIntelligence } from "@/components/CompetitorIntelligence";
import { ExampleResults } from "@/components/ExampleResults";
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
import { Pricing } from "@/components/Pricing";
import { AuditForm } from "@/components/AuditForm";
import { Roadmap } from "@/components/Roadmap";
import { Vision } from "@/components/Vision";
import { FinalCTA } from "@/components/FinalCTA";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <CheckoutCancelledNotice />
      <Header />
      <main>
        <Hero />
        <Vision />
        <MarqueeStrip />
        <SimpleExample />
        <ManualVsPartnra />
        <Problem />
        <NotJustInfluencers />
        <CommercialIntent />
        <CreatorComparison />
        <CompetitorIntelligence />
        <ExampleResults />
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
        <Pricing />
        <AuditForm />
        <Roadmap />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
