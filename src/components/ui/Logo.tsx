import clsx from "clsx";

// Fixed pixel dimensions (not width:auto) at every breakpoint — Safari has
// known bugs sizing images inside flex rows when width is left to resolve
// from an intrinsic aspect ratio, which can visually clip the trailing edge.
export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <img
      src="/brand/partnra-logo-horizontal-transparent.png"
      alt="PARTNRA"
      width={1507}
      height={283}
      fetchPriority={priority ? "high" : undefined}
      style={{ maxWidth: "none" }}
      className={clsx(
        "block h-8 w-[170px] shrink-0 object-contain sm:h-9 sm:w-[192px] md:h-10 md:w-[213px]",
        className
      )}
    />
  );
}

export function LogoChip({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        "inline-flex items-center rounded-2xl bg-paper px-5 py-3",
        className
      )}
    >
      <Logo />
    </div>
  );
}

export function LogoIcon({ className }: { className?: string }) {
  return (
    <img
      src="/brand/partnra-icon-transparent.png"
      alt="PARTNRA"
      width={289}
      height={275}
      style={{ maxWidth: "none" }}
      className={clsx("block h-8 w-8 shrink-0 object-contain", className)}
    />
  );
}
