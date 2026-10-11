import { cn } from "@/lib/utils";

/**
 * A red count pill, for "this many things are waiting on you".
 *
 * Renders nothing at zero, so the badge disappears on its own once the queue
 * is empty rather than sitting there reading "0". Large counts are capped at
 * 99+ so the pill never pushes a label out of its row.
 */
export function CountBadge({
  count, label, className,
}: {
  count: number | undefined;
  /** What is being counted, for screen readers: "pending requests". */
  label: string;
  className?: string;
}) {
  if (!count || count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-none text-white tabular-nums",
        className,
      )}
      aria-label={`${count} ${label}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
