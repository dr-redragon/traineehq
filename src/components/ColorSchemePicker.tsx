import { AlertCircle, Check } from "lucide-react";

import { COLOR_SCHEMES } from "@/lib/colorSchemes";
import { useColorScheme } from "@/hooks/useColorScheme";
import { cn } from "@/lib/utils";

/**
 * The accent picker.
 *
 * Each option shows the scheme's own four steps rather than a single dot: the
 * pastel tint a tag is filled with, the step a hovered row goes, the rule, and
 * the fill a primary button takes. One dot would show the vivid accent and
 * nothing about the colour you will actually spend the day looking at, which
 * on this palette is mostly the tint.
 *
 * Choosing applies immediately — there is no Save. The whole point of a colour
 * choice is that you see it and change your mind.
 */
export function ColorSchemePicker() {
  const { scheme, setScheme, saveFailed } = useColorScheme();

  return (
    <div className="space-y-3">
      <div
        role="radiogroup"
        aria-label="Accent colour scheme"
        className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-3"
      >
        {COLOR_SCHEMES.map((s) => {
          const selected = scheme === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setScheme(s.id)}
              className={cn(
                "flex flex-col gap-2.5 bg-background p-3 text-left transition-colors",
                selected ? "bg-accent" : "hover:bg-accent",
              )}
            >
              <span className="flex items-center gap-2">
                {/* The scheme's own steps, drawn in its colours rather than
                    the current theme's — this is a preview, so it has to
                    ignore whichever scheme is active. */}
                <span className="flex" aria-hidden>
                  {s.swatches.map((c) => (
                    <span key={c} className="h-5 w-3.5" style={{ backgroundColor: c }} />
                  ))}
                </span>
                {selected && <Check className="ml-auto h-4 w-4 shrink-0 text-rule" aria-hidden />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold">{s.name}</span>
                <span className="block truncate text-[12px] text-muted-foreground">{s.note}</span>
              </span>
            </button>
          );
        })}
      </div>
      {saveFailed ? (
        <p className="flex items-start gap-1.5 text-[12px] text-destructive">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          The colour is applied here, but it could not be saved to your account. It
          will go back to your saved choice on another device.
        </p>
      ) : (
        <p className="text-[12px] text-muted-foreground">
          Saved to your account, so it follows you to any device you sign in on.
        </p>
      )}
    </div>
  );
}
