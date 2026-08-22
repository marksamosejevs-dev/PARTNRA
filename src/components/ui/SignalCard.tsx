import clsx from "clsx";

export function SignalCard({
  label,
  value,
  tone = "light",
}: {
  label: string;
  value: string;
  tone?: "light" | "dark";
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border p-5 md:p-6",
        tone === "light" ? "border-ink/10 bg-paper" : "border-white/10 bg-white/[0.03]"
      )}
    >
      <div
        className={clsx(
          "font-mono-label text-[11px] font-semibold uppercase tracking-[0.16em]",
          tone === "light" ? "text-ink/40" : "text-paper/40"
        )}
      >
        {label}
      </div>
      <div
        className={clsx(
          "font-display mt-3 text-lg font-medium tracking-tight md:text-xl",
          tone === "light" ? "text-ink" : "text-paper"
        )}
      >
        {value}
      </div>
    </div>
  );
}
