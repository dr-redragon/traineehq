import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Modernist buttons are set in the heading face at its full weight, at the
  // same 14px as an input so the pair lines up in a form row, and they carry
  // no radius. Focus is the global 2px accent ring from index.css rather than
  // shadcn's offset ring, so the ring utilities are dropped here.
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-display text-sm font-extrabold leading-tight transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Hover and pressed states step down the accent ramp rather than
        // fading the fill with an alpha — the design system asks for a solid
        // step, and a faded red over the ground goes pink.
        default: "bg-primary text-primary-foreground hover:bg-accent-700 active:bg-accent-800",
        destructive: "bg-destructive text-destructive-foreground hover:bg-accent-900 active:bg-accent-900",
        // The secondary is an outline in the divider, tinted with ink on
        // hover — no fill of its own, so the grid stays the loudest thing.
        outline: "border border-input bg-transparent hover:bg-foreground/[0.07] active:bg-foreground/[0.14]",
        secondary: "bg-secondary text-secondary-foreground hover:bg-foreground/[0.07] active:bg-foreground/[0.14]",
        ghost: "text-accent-foreground hover:bg-accent active:bg-accent-200",
        // Deep enough for paragraph-size text, which the base accent is not.
        link: "text-accent-700 underline underline-offset-[3px] hover:text-accent-800",
      },
      size: {
        // 36px is the design system's control height, shared with the input.
        default: "h-9 px-3.5 py-2",
        sm: "h-8 px-2.5 text-[13px]",
        lg: "h-11 px-6",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
