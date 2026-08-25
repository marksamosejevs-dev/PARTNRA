"use client";

import { MouseEvent } from "react";
import { Container } from "./ui/Container";
import { LogoChip } from "./ui/Logo";
import { scrollToHash } from "@/lib/scroll";
import { useCookieConsent } from "./CookieConsent";

const LINKS = [
  { label: "Product", href: "#product" },
  { label: "Alex", href: "#alex" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "Contact", href: "#audit" },
];

const LEGAL_LINKS = [
  { label: "Terms of Service", href: "/legal/terms" },
  { label: "Privacy Policy", href: "/legal/privacy" },
  { label: "Cookie Policy", href: "/legal/cookies" },
  { label: "Cancellation Policy", href: "/legal/cancellation" },
];

export function Footer() {
  const { openPreferences } = useCookieConsent();
  const year = new Date().getFullYear();

  return (
    <footer className="bg-ink pt-16 pb-8 text-paper">
      <Container>
        <div className="flex flex-col justify-between gap-10 border-b border-white/10 pb-12 md:flex-row md:items-start">
          <div>
            <LogoChip />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-paper/45">
              AI affiliate recruitment for modern commerce.
            </p>
            <p className="font-mono-label mt-4 text-xs uppercase tracking-[0.16em] text-paper/30">
              PARTNRA.AI
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-12 gap-y-8 sm:grid-cols-3 md:gap-x-16">
            <nav className="flex flex-col gap-3">
              {LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                    e.preventDefault();
                    scrollToHash(link.href);
                  }}
                  className="text-sm text-paper/55 transition-colors hover:text-paper"
                >
                  {link.label}
                </a>
              ))}
            </nav>

            <nav className="flex flex-col gap-3">
              {LEGAL_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-sm text-paper/55 transition-colors hover:text-paper"
                >
                  {link.label}
                </a>
              ))}
              <button
                type="button"
                id="cookie-settings-trigger"
                onClick={openPreferences}
                className="text-left text-sm text-paper/55 transition-colors hover:text-paper"
              >
                Cookie settings
              </button>
            </nav>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-8 text-xs text-paper/35 sm:flex-row sm:items-center sm:justify-between">
          <span>© {year} IMUNO.LV SIA</span>
          <span>Built for ambitious DTC brands.</span>
        </div>
      </Container>
    </footer>
  );
}
