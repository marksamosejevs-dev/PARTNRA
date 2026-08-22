import { MeetAlex } from "./MeetAlex";
import { AlexDashboard } from "./AlexDashboard";

export function AlexSection() {
  return (
    <section id="alex" className="scroll-mt-24 bg-ink">
      <MeetAlex />
      <AlexDashboard />
    </section>
  );
}
