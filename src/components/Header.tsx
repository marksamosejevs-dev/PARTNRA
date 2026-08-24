"use client";

import { useEffect, useState, MouseEvent } from "react";
import clsx from "clsx";
import { Logo } from "./ui/Logo";
import { Button } from "./ui/Button";
import { Container } from "./ui/Container";
import { scrollToHash } from "@/lib/scroll";

const NAV = [
  { label: "Product", href: "#product", id: "product" },
  { label: "Alex", href: "#alex", id: "alex" },
  { label: "How it works", href: "#how-it-works", id: "how-it-works" },
  { label: "Pricing", href: "#pricing", id: "pricing" },
  { label: "Pilot", href: "#pilot", id: "pilot" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

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

  useEffect(() => {
    const sections = NAV.map((item) => document.getElementById(item.id)).filter(
      (el): el is HTMLElement => el !== null
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.filter((entry) => entry.isIntersecting);
        if (intersecting.length === 0) return;
        // Prefer the section closest to the top of the scrollspy band —
        // i.e. the one whose top edge is highest (least negative/most positive).
        const top = intersecting.reduce((best, entry) =>
          entry.boundingClientRect.top > best.boundingClientRect.top ? entry : best
        );
        setActiveId(top.target.id);
      },
      { rootMargin: "-112px 0px -75% 0px", threshold: 0 }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <header
      className={clsx(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled || menuOpen
          ? "border-b border-ink/10 bg-paper/90 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      )}
    >
      <Container>
        <div className="flex h-20 items-center justify-between md:h-24">
          <a
            href="#top"
            onClick={(e: MouseEvent<HTMLAnchorElement>) => {
              e.preventDefault();
              scrollToHash("#top");
            }}
            className="flex shrink-0 items-center overflow-visible py-2"
            aria-label="PARTNRA home"
          >
            <Logo priority />
          </a>

          <nav className="hidden items-center gap-10 lg:flex">
            {NAV.map((item) => {
              const isActive = activeId === item.id;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                    e.preventDefault();
                    scrollToHash(item.href);
                  }}
                  className={clsx(
                    "group relative py-2 text-[18px] font-semibold tracking-tight transition-colors duration-200",
                    isActive ? "text-ink" : "text-ink/55 hover:text-ink"
                  )}
                >
                  {item.label}
                  <span
                    className={clsx(
                      "pointer-events-none absolute -bottom-0.5 left-0 h-[2px] w-full origin-left scale-x-0 bg-lime transition-transform duration-200 ease-out group-hover:scale-x-100",
                      isActive && "scale-x-100"
                    )}
                  />
                </a>
              );
            })}
          </nav>

          <div className="hidden lg:block">
            <Button href="#audit" variant="secondary" size="sm">
              Free audit
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
              <a
                key={item.href}
                href={item.href}
                onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                  e.preventDefault();
                  setMenuOpen(false);
                  scrollToHash(item.href);
                }}
                className={clsx(
                  "py-3 text-lg font-semibold transition-colors",
                  activeId === item.id ? "text-ink" : "text-ink/70"
                )}
              >
                {item.label}
              </a>
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
