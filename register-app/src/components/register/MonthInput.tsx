import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatMonth, parseMonth } from "@/lib/register/months";
import { cn } from "@/lib/utils";

/**
 * A month, typed however the organiser likes.
 *
 * Accepts `2026-01`, `01/2026`, `1/26`, `Jan 2026`, `january 2026`, `sept 26`
 * and more — see `parseMonth`. What is typed is left alone while the field has
 * focus and normalised to "Jan 2026" on the way out, so the register never
 * argues with somebody mid-keystroke. The value handed upward is always
 * 'YYYY-MM', or '' when it could not be read.
 */
export function MonthInput({
  value, onChange, placeholder = "e.g. Jan 2026", id, className,
}: {
  value: string | null;
  onChange: (month: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
}) {
  const [text, setText] = useState(() => (value ? formatMonth(value, "en-GB") : ""));
  const [focused, setFocused] = useState(false);

  // Follow the value when it changes from outside — a dialog reopening on a
  // different row, say — but never while somebody is typing into it.
  useEffect(() => {
    if (!focused) setText(value ? formatMonth(value, "en-GB") : "");
  }, [value, focused]);

  const commit = () => {
    setFocused(false);
    const parsed = parseMonth(text);
    onChange(parsed);
    setText(parsed ? formatMonth(parsed, "en-GB") : text);
  };

  const unreadable = text.trim() !== "" && parseMonth(text) === "";

  return (
    <Input
      id={id}
      value={text}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
      aria-invalid={unreadable}
      className={cn(unreadable && "border-destructive", className)}
    />
  );
}
