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
        // Hover and pressed states are a solid step along the ramp rather
        // than the fill faded with an alpha, and they come from tokens so the
        // teaching register's own moss and clay follow through unchanged.
        default: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive-hover active:bg-destructive-hover",
        // The secondary is an outline in the divider, tinted with ink on
        // hover — no fill of its own, so the grid stays the loudest thing.
        outline: "border border-input bg-transparent hover:bg-foreground/[0.07] active:bg-foreground/[0.14]",
        secondary: "bg-secondary text-secondary-foreground hover:bg-foreground/[0.07] active:bg-foreground/[0.14]",
        ghost: "text-accent-foreground hover:bg-accent active:bg-accent-strong",
        // Deep enough for paragraph-size text, which the base accent is not.
        link: "text-accent-deep underline underline-offset-[3px] hover:text-primary",
      },
      size: {
        // 36px is the design system's control height, shared with the input.
        // Read through a variable so the teaching register can keep the 40px
        // control it had, rather than being shortened along with the rest.
        default: "h-[var(--control-h)] px-3.5 py-2",
        sm: "h-[var(--control-h-sm)] px-2.5 text-[13px]",
        lg: "h-[var(--control-h-lg)] px-6",
        icon: "h-[var(--control-h)] w-[var(--control-h)] p-0",
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
    return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
