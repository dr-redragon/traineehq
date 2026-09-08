import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

/**
 * Light, dark, or follow the device.
 *
 * "System" is offered as a real choice rather than just the starting value: on a
 * phone set to switch at dusk, a teaching day that runs into the evening should
 * follow the phone rather than stay on whatever was picked at lunchtime.
 *
 * `resolvedTheme` is what is actually on screen, `theme` is what was chosen —
 * they differ under "system", so the tick marks the choice while the icon shows
 * the result.
 */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  // next-themes cannot know the resolved theme until it has read the document,
  // so the first render would otherwise guess and flip the icon a moment later.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const Icon = resolvedTheme === "dark" ? Moon : Sun;
  const chosen = OPTIONS.find((o) => o.value === theme)?.label ?? "System";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Change theme (currently ${ready ? chosen.toLowerCase() : "loading"})`}
        >
          {/* Held invisible rather than unmounted, so the header does not
              reflow the moment the theme resolves. */}
          <Icon className={`h-4 w-4 transition-opacity ${ready ? "opacity-100" : "opacity-0"}`} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {OPTIONS.map(({ value, label, Icon: OptionIcon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className="gap-2"
          >
            <OptionIcon className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">{label}</span>
            {ready && theme === value && <span aria-hidden="true">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
