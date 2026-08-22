import Image from "next/image";
import clsx from "clsx";

export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/partnra-logo-horizontal-transparent.png"
      alt="PARTNRA"
      width={1507}
      height={283}
      priority={priority}
      className={clsx("h-6 w-auto md:h-7", className)}
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
    <Image
      src="/brand/partnra-icon-transparent.png"
      alt="PARTNRA"
      width={289}
      height={275}
      className={clsx("h-8 w-auto", className)}
    />
  );
}
