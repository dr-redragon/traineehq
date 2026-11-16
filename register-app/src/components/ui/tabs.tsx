import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    data-slot="tabs-list"
    className={cn(
      // Modernist names no tab component, so this is the system's own
      // vocabulary applied to one: the pill and its inset track are dropped
      // for a strong baseline rule with the labels sitting flush left on it,
      // and the selected tab is marked by the accent running under it. Same
      // move as the rail, turned on its side.
      "inline-flex h-auto items-center justify-start gap-1 rounded-none border-b-2 border-border bg-transparent p-0 text-muted-foreground",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    data-slot="tabs-trigger"
    className={cn(
      // The -mb-[2px] pulls the trigger's own border down onto the list's
      // baseline rule so the active marker replaces that rule rather than
      // sitting above it.
      "-mb-[2px] inline-flex items-center justify-center whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 font-display text-sm font-extrabold transition-colors hover:text-foreground focus-visible:outline-none focus-visible:outline-offset-[-2px] data-[state=active]:border-rule data-[state=active]:text-foreground data-[state=active]:shadow-none disabled:pointer-events-none disabled:opacity-45",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 focus-visible:outline-none",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
