import clsx from "clsx";

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
            "font-display shrink-0 whitespace-nowrap pr-10 text-[13vw] leading-none md:pr-16 md:text-[7vw]",
            textClassName
          )}
        >
          {item}
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
