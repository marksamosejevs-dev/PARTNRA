"use client";

import { MouseEvent } from "react";
import { Container } from "./ui/Container";
import { LogoChip } from "./ui/Logo";
import { scrollToHash } from "@/lib/scroll";

const LINKS = [
  { label: "Product", href: "#product" },
  { label: "Alex", href: "#alex" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Pilot", href: "#pilot" },
  { label: "Contact", href: "#audit" },
  { label: "Privacy", href: "#" },
  { label: "Terms", href: "#" },
];

export function Footer() {
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

          <nav className="grid grid-cols-2 gap-x-12 gap-y-3 sm:grid-cols-4 md:gap-x-16">
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
        </div>

        <div className="flex flex-col gap-2 pt-8 text-xs text-paper/35 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 PARTNRA</span>
          <span>Built for ambitious DTC brands.</span>
        </div>
      </Container>
    </footer>
  );
}
