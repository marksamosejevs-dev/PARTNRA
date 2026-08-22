"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Logo, LogoIcon } from "./ui/Logo";
import { Button } from "./ui/Button";
import { Container } from "./ui/Container";

const NAV = [
  { label: "Product", href: "#product" },
  { label: "Alex", href: "#alex" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Pilot", href: "#pilot" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <header
      className={clsx(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled || menuOpen
          ? "border-b border-ink/10 bg-paper/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      )}
    >
      <Container>
        <div className="flex h-16 items-center justify-between md:h-20">
          <Link href="#top" className="shrink-0" aria-label="PARTNRA home">
            <Logo className="hidden md:block" priority />
            <LogoIcon className="md:hidden" />
          </Link>

          <nav className="hidden items-center gap-9 lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-ink/70 transition-colors hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden lg:block">
            <Button href="#audit" variant="primary" className="!px-5 !py-3 text-[13px]">
              Free affiliate audit
            </Button>
          </div>

          <button
            className="flex h-10 w-10 flex-col items-center justify-center gap-[5px] lg:hidden"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span
              className={clsx(
                "h-[1.5px] w-6 bg-ink transition-transform duration-300",
                menuOpen && "translate-y-[6.5px] rotate-45"
              )}
            />
            <span
              className={clsx(
                "h-[1.5px] w-6 bg-ink transition-transform duration-300",
                menuOpen && "-rotate-45 -translate-y-[6.5px]"
              )}
            />
          </button>
        </div>
      </Container>

      <div
        className={clsx(
          "overflow-hidden border-t border-ink/10 bg-paper transition-[max-height] duration-300 ease-in-out lg:hidden",
          menuOpen ? "max-h-96" : "max-h-0 border-t-0"
        )}
      >
        <Container>
          <nav className="flex flex-col gap-1 py-4">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="py-3 text-lg font-medium text-ink/80"
              >
                {item.label}
              </Link>
            ))}
            <Button
              href="#audit"
              variant="secondary"
              onClick={() => setMenuOpen(false)}
              className="mt-3 justify-center"
            >
              Free affiliate audit
            </Button>
          </nav>
        </Container>
      </div>
    </header>
  );
}
