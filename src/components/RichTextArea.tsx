import { useLayoutEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Bold, Italic, Underline, Strikethrough } from "lucide-react";
import { toggleMarker, type RichMark } from "@/lib/richText";

const TOOLS: Array<{ mark: RichMark; label: string; icon: typeof Bold; shortcut?: string }> = [
  { mark: "bold", label: "Bold", icon: Bold, shortcut: "b" },
  { mark: "italic", label: "Italic", icon: Italic, shortcut: "i" },
  { mark: "underline", label: "Underline", icon: Underline, shortcut: "u" },
  { mark: "strike", label: "Strikethrough", icon: Strikethrough },
];

interface RichTextAreaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  className?: string;
}

/** Textarea with a bold / italic / underline / strikethrough toolbar. */
export function RichTextArea({
  value, onChange, placeholder, rows = 3, autoFocus, className,
}: RichTextAreaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [pendingSelection, setPendingSelection] = useState<[number, number] | null>(null);

  // Restore the caret after the controlled value round-trips through the parent.
  useLayoutEffect(() => {
    if (!pendingSelection || !ref.current) return;
    ref.current.focus();
    ref.current.setSelectionRange(pendingSelection[0], pendingSelection[1]);
    setPendingSelection(null);
  }, [pendingSelection, value]);

  const apply = (mark: RichMark) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = toggleMarker(value, start, end, mark);
    onChange(next.value);
    setPendingSelection([next.selectionStart, next.selectionEnd]);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-0.5">
        {TOOLS.map(({ mark, label, icon: Icon }) => (
          <Button
            key={mark}
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={label}
            aria-label={label}
            // Keep the textarea's selection while the button takes the click.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply(mark)}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        ))}
      </div>
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (!(e.metaKey || e.ctrlKey)) return;
          const tool = TOOLS.find((t) => t.shortcut && t.shortcut === e.key.toLowerCase());
          if (!tool) return;
          e.preventDefault();
          apply(tool.mark);
        }}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        className={className}
      />
    </div>
  );
}
