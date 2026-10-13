import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PASSWORD_RULES } from "@/lib/passwordRules";

/**
 * The password requirements, each ticked or crossed as the person types, and
 * whether the confirmation matches. Failures are a plain red rather than the
 * theme's destructive colour, which some colour schemes make navy. Before
 * anything is typed the list sits in a neutral grey: red crosses on an empty
 * form read as a telling-off.
 */
export function PasswordChecklist({
  id, password, confirm, className,
}: {
  id?: string;
  password: string;
  /** Leave out where there is no confirmation field. */
  confirm?: string;
  className?: string;
}) {
  const items: { id: string; label: string; ok: boolean; started: boolean }[] =
    PASSWORD_RULES.map((rule) => ({
      id: rule.id, label: rule.label, ok: rule.test(password), started: password.length > 0,
    }));
  if (confirm !== undefined) {
    const matches = !!confirm && confirm === password;
    items.push({
      id: "match",
      label: matches ? "Passwords match" : confirm ? "Passwords do not match" : "Confirm your password",
      ok: matches,
      started: confirm.length > 0,
    });
  }

  return (
    <ul id={id} className={cn("space-y-1 text-[13px]", className)} aria-label="Password requirements" aria-live="polite">
      {items.map((item) => (
        <li
          key={item.id}
          className={cn(
            "flex items-center gap-2",
            item.ok ? "text-success" : item.started ? "text-red-700 dark:text-red-400" : "text-muted-foreground",
          )}
        >
          {item.ok
            ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
            : <X className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          <span>{item.label}</span>
          <span className="sr-only">{item.ok ? "(met)" : "(not met)"}</span>
        </li>
      ))}
    </ul>
  );
}
