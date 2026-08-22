"use client";

import clsx from "clsx";
import Link from "next/link";
import { Arrow } from "./Arrow";
import { ReactNode, MouseEvent } from "react";
import { scrollToHash } from "@/lib/scroll";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "group relative inline-flex items-center justify-center gap-2.5 rounded-full font-semibold tracking-tight transition-all duration-200 ease-out whitespace-nowrap will-change-transform active:scale-[0.99]";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:brightness-125",
  secondary:
    "bg-lime text-ink shadow-[0_0_0_0_rgba(199,255,53,0)] hover:brightness-110 hover:scale-[1.02] hover:shadow-[0_0_32px_4px_rgba(199,255,53,0.45)]",
  ghost: "bg-transparent text-ink hover:opacity-60 px-0 py-0",
};

const sizes: Record<Size, string> = {
  sm: "h-11 px-5 text-[13px]",
  md: "h-14 px-7 text-[15px]",
  lg: "h-14 px-8 text-base md:h-16 md:px-10 md:text-lg",
};

export function Button({
  href,
  children,
  variant = "primary",
  size = "md",
  className,
  arrow = true,
  onClick,
  type = "button",
}: {
  href?: string;
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
  arrow?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  const sizeClasses = variant === "ghost" ? "" : sizes[size];

  const content = (
    <>
      {children}
      {arrow && (
        <Arrow className="group-hover:translate-x-1 group-hover:-translate-y-1" />
      )}
    </>
  );

  if (href) {
    const isHash = href.startsWith("#");

    if (isHash) {
      const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        scrollToHash(href);
        onClick?.();
      };

      return (
        <a
          href={href}
          onClick={handleClick}
          className={clsx(base, sizeClasses, variants[variant], className)}
        >
          {content}
        </a>
      );
    }

    return (
      <Link href={href} className={clsx(base, sizeClasses, variants[variant], className)}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      className={clsx(base, sizeClasses, variants[variant], className)}
    >
      {content}
    </button>
  );
}
