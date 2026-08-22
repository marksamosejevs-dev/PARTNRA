import clsx from "clsx";

export function Arrow({ className }: { className?: string }) {
  return (
    <span
      className={clsx("inline-block transition-transform duration-300", className)}
      aria-hidden="true"
    >
      ↗
    </span>
  );
}
