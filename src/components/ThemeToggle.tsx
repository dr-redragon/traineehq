import { useTheme } from "@/hooks/useTheme";
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
 * follow the phone rather than stay on whatever was picked at lunchtime. Pick
 * light or dark and the device is not consulted again.
 *
 * `resolvedTheme` is what is actually on screen, `theme` is what was chosen —
 * they differ under "system", so the tick marks the choice while the icon shows
 * the result.
 *
 * The choice is saved to the account, so it follows the reader to any device
 * they sign in on. See src/hooks/useTheme.tsx.
 */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const Icon = resolvedTheme === "dark" ? Moon : Sun;
  const chosen = OPTIONS.find((o) => o.value === theme)?.label ?? "System";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Change theme (currently ${chosen.toLowerCase()})`}
        >
          <Icon className="h-4 w-4" />
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
            {theme === value && <span aria-hidden="true">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
