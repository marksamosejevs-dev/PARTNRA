import { Marquee } from "./ui/Marquee";

const items = ["DISCOVER", "QUALIFY", "CONTACT", "RECRUIT", "GROW"];

export function MarqueeStrip() {
  return (
    <section className="border-y border-ink/10 bg-paper py-8 md:py-10">
      <Marquee items={items} textClassName="text-ink" />
    </section>
  );
}
