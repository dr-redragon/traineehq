import { AlertCircle, Check, Monitor, Moon, Sun } from "lucide-react";

import { useTheme } from "@/hooks/useTheme";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Theme; name: string; note: string; Icon: typeof Sun }[] = [
  { value: "light", name: "Light", note: "Always the light ground", Icon: Sun },
  { value: "dark", name: "Dark", note: "Always the dark ground", Icon: Moon },
  { value: "system", name: "System", note: "Follow this device", Icon: Monitor },
];

/**
 * Light, dark, or follow the device — in Settings, beside the accent picker.
 *
 * The same choice as the toggle in the top bar, spelled out. The toggle is a
 * single icon in a row of chrome, which is the right thing when you want to
 * flip the lights and the wrong thing when you are looking for where the
 * setting lives; and it is the only place this was ever shown, so "System"
 * looked like a starting state rather than an option.
 *
 * Choosing applies immediately — there is no Save, same as the colour above.
 */
export function ThemePicker() {
  const { theme, setTheme, saveFailed } = useTheme();

  return (
    <div className="space-y-3">
      <div
        role="radiogroup"
        aria-label="Appearance"
        className="grid grid-cols-3 gap-px border border-border bg-border"
      >
        {OPTIONS.map(({ value, name, note, Icon }) => {
          const selected = theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(value)}
              className={cn(
                "flex flex-col gap-2.5 bg-background p-3 text-left transition-colors",
                selected ? "bg-accent" : "hover:bg-accent",
              )}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-5 w-5 shrink-0 text-rule" aria-hidden />
                {selected && <Check className="ml-auto h-4 w-4 shrink-0 text-rule" aria-hidden />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold">{name}</span>
                <span className="block truncate text-[12px] text-muted-foreground">{note}</span>
              </span>
            </button>
          );
        })}
      </div>
      {saveFailed ? (
        <p className="flex items-start gap-1.5 text-[12px] text-destructive">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          The appearance is applied here, but it could not be saved to your account.
          It will go back to your saved choice on another device.
        </p>
      ) : (
        <p className="text-[12px] text-muted-foreground">
          Saved to your account, so it follows you to any device you sign in on.
          Light and Dark ignore what the device asks for.
        </p>
      )}
    </div>
  );
}
