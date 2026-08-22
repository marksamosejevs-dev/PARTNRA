import { ReactNode } from "react";
import clsx from "clsx";

export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("mx-auto w-full max-w-[1400px] px-6 md:px-10 lg:px-14", className)}>
      {children}
    </div>
  );
}
