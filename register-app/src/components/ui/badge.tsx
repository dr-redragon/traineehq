import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // The design system's tag: square, 11px, tinted from a ramp step rather
  // than filled with the role colour. `rounded-sm` resolves through
  // --radius, so it is 0 here and stays rounded inside the register.
  "inline-flex items-center rounded-sm border px-2.5 py-[3px] text-[11px] font-medium tracking-[0.02em] transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        // Tinted from the accent's lightest step with text from its deepest
        // — the pairing the design system uses for a tag, and legible at 11px,
        // which a solid accent fill is not. Both are tokens, so inside the
        // register the tag is sage and moss rather than red.
        default: "border-transparent bg-accent text-accent-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-rule text-accent-deep",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
