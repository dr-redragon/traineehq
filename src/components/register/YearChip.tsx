import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * One year in a row of academic-year filters.
 *
 * A filter is on or off, so it is a toggle button and says so: `aria-pressed`
 * is what tells a screen reader which years a report covers, and it is the
 * state a test can assert without reading a colour.
 *
 * Selected is deliberately more than a background colour. On a phone the last
 * button tapped keeps :hover until you touch something else, and the hovered
 * unselected background sits close enough to the selected one that the row
 * looked stuck — you could not tell what you had just turned off. The hover
 * fake is dealt with at the root (`hoverOnlyWhenSupported` in
 * tailwind.config.ts); the ring and the weight here mean selection does not
 * rest on one shade of a background either way.
 */
export function YearChip({
  pressed,
  title,
  onClick,
  children,
}: {
  pressed: boolean;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={pressed ? "default" : "outline"}
      aria-pressed={pressed}
      title={title}
      onClick={onClick}
      className={cn(
        // 32px tall: the smallest that stays comfortable to hit in a row of
        // eight of these on a phone.
        "h-8 select-none touch-manipulation px-3 text-xs",
        pressed
          ? "font-semibold ring-2 ring-primary/40 ring-offset-1 ring-offset-background"
          : "font-normal",
      )}
    >
      {children}
    </Button>
  );
}
