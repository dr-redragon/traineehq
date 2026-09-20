import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        data-slot="input"
        className={cn(
          // The design system's field: 36px, a single divider-weight rule, filled
        // with the surface rather than the ground so it reads as an inset, and
        // a caret in the accent. Focus is the global 2px accent ring, drawn
        // tight to the edge — an offset ring on a square field reads as a
        // second border.
        "flex h-[var(--field-h)] w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm caret-rule transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-foreground/45 focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-45",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
