import clsx from "clsx";
import Link from "next/link";
import { Arrow } from "./Arrow";
import { ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "group inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold tracking-tight transition-all duration-300 whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-lime hover:text-ink",
  secondary: "bg-lime text-ink hover:bg-ink hover:text-lime",
  ghost: "bg-transparent text-ink hover:opacity-60 px-0 py-0",
};

export function Button({
  href,
  children,
  variant = "primary",
  className,
  arrow = true,
  onClick,
  type = "button",
}: {
  href?: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
  arrow?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  const content = (
    <>
      {children}
      {arrow && (
        <Arrow className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={clsx(base, variants[variant], className)}>
        {content}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} className={clsx(base, variants[variant], className)}>
      {content}
    </button>
  );
}
