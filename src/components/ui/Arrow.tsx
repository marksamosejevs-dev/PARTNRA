import clsx from "clsx";

export function Arrow({
  className,
  direction = "up-right",
}: {
  className?: string;
  direction?: "up-right" | "right";
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={clsx("inline-block h-[1em] w-[1em] shrink-0 transition-transform duration-200", className)}
    >
      {direction === "up-right" ? (
        <>
          <line x1="7" y1="17" x2="17" y2="7" />
          <polyline points="8 7 17 7 17 16" />
        </>
      ) : (
        <>
          <line x1="4" y1="12" x2="20" y2="12" />
          <polyline points="13 5 20 12 13 19" />
        </>
      )}
    </svg>
  );
}
