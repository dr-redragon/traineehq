import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-[90px] w-full resize-y rounded-md border border-input bg-card px-2.5 py-1.5 text-sm caret-rule transition-colors placeholder:text-muted-foreground hover:border-foreground/45 focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
