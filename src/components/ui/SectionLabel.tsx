import clsx from "clsx";

export function SectionLabel({
  children,
  tone = "ink",
  className,
}: {
  children: React.ReactNode;
  tone?: "ink" | "paper" | "lime";
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "font-mono-label inline-flex items-center gap-2 text-[11px] md:text-xs font-medium uppercase tracking-[0.22em]",
        tone === "ink" && "text-ink/50",
        tone === "paper" && "text-paper/50",
        tone === "lime" && "text-lime",
        className
      )}
    >
      {children}
    </div>
  );
}
