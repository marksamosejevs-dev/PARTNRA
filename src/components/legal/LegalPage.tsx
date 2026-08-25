import { ReactNode } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Container } from "@/components/ui/Container";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="pt-32 pb-24 md:pt-44 md:pb-32">
        <Container>
          <div className="mx-auto max-w-2xl">
            <h1 className="font-display text-[clamp(2rem,5.5vw,3.6rem)] font-medium leading-[1.05] tracking-tight">
              {title}
            </h1>
            <p className="mt-4 text-sm text-ink/40">Last updated: {updated}</p>

            <div className="legal-prose mt-14">{children}</div>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
