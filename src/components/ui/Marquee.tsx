import clsx from "clsx";
import { Arrow } from "./Arrow";

export function Marquee({
  items,
  className,
  textClassName,
}: {
  items: string[];
  className?: string;
  textClassName?: string;
}) {
  const track = (
    <div className="flex shrink-0 items-center">
      {items.map((item, i) => (
        <span
          key={i}
          className={clsx(
            "font-display flex shrink-0 items-center gap-x-6 whitespace-nowrap pr-10 text-[13vw] leading-none md:gap-x-10 md:pr-16 md:text-[7vw]",
            textClassName
          )}
        >
          {item}
          <Arrow direction="right" className="text-lime" />
        </span>
      ))}
    </div>
  );

  return (
    <div className={clsx("overflow-hidden", className)}>
      <div className="marquee-track flex w-max shrink-0">
        {track}
        {track}
      </div>
    </div>
  );
}
