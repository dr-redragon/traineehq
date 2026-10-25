import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, MessageSquareQuote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageText } from "@/components/PageText";
import { toggleMarker, type RichMark } from "@/lib/richText";
import { toggleLinePrefix } from "@/lib/pageText";

const MAX_LENGTH = 50000;

type Tool =
  | { kind: "mark"; mark: RichMark; label: string; icon: typeof Bold; shortcut?: string }
  | { kind: "line"; prefix: string; label: string; icon: typeof Bold }
  | { kind: "link"; label: string; icon: typeof Bold; shortcut?: string };

const TOOLS: Tool[] = [
  { kind: "line", prefix: "## ", label: "Heading", icon: Heading2 },
  { kind: "line", prefix: "### ", label: "Subheading", icon: Heading3 },
  { kind: "mark", mark: "bold", label: "Bold", icon: Bold, shortcut: "b" },
  { kind: "mark", mark: "italic", label: "Italic", icon: Italic, shortcut: "i" },
  { kind: "line", prefix: "- ", label: "Bulleted list", icon: List },
  { kind: "line", prefix: "1. ", label: "Numbered list", icon: ListOrdered },
  { kind: "line", prefix: "> ", label: "Callout", icon: MessageSquareQuote },
  { kind: "link", label: "Link", icon: Link2, shortcut: "k" },
];

/**
 * Write the text on a page or folder.
 *
 * A plain textarea with a toolbar over the page-text format rather than a
 * WYSIWYG editor: what is stored is exactly what is typed, it survives being
 * pasted in from a deanery page, and Preview shows it as trainees will.
 */
export function PageTextEditor({
  open, onOpenChange, title, initialText, saving, onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialText: string;
  saving?: boolean;
  onSave: (text: string) => void;
}) {
  const [value, setValue] = useState(initialText);
  const [tab, setTab] = useState("write");
  const ref = useRef<HTMLTextAreaElement>(null);
  const [pendingSelection, setPendingSelection] = useState<[number, number] | null>(null);

  // Each opening starts from what is saved, not from a draft abandoned last time.
  useEffect(() => {
    if (open) { setValue(initialText); setTab("write"); }
  }, [open, initialText]);

  useLayoutEffect(() => {
    if (!pendingSelection || !ref.current) return;
    ref.current.focus();
    ref.current.setSelectionRange(pendingSelection[0], pendingSelection[1]);
    setPendingSelection(null);
  }, [pendingSelection, value]);

  const apply = (tool: Tool) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    if (tool.kind === "mark") {
      const next = toggleMarker(value, start, end, tool.mark);
      setValue(next.value);
      setPendingSelection([next.selectionStart, next.selectionEnd]);
    } else if (tool.kind === "line") {
      const next = toggleLinePrefix(value, start, end, tool.prefix);
      setValue(next.value);
      setPendingSelection([next.selectionStart, next.selectionEnd]);
    } else {
      // The selection becomes the link text and the address is selected, ready
      // to be pasted over.
      const label = value.slice(start, end) || "link text";
      const inserted = `[${label}](https://)`;
      setValue(value.slice(0, start) + inserted + value.slice(end));
      const urlStart = start + label.length + 3;
      setPendingSelection([urlStart, urlStart + "https://".length]);
    }
  };

  const tooLong = value.length > MAX_LENGTH;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Text for {title}</DialogTitle>
          <DialogDescription>
            Shown above the files. Start a line with ## for a heading, - for a bullet or &gt; for a callout.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="write">Write</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
          <TabsContent value="write" className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label="Formatting">
              {TOOLS.map((tool) => {
                const Icon = tool.icon;
                return (
                  <Button
                    key={tool.label}
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={tool.label}
                    aria-label={tool.label}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => apply(tool)}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                );
              })}
            </div>
            <Textarea
              ref={ref}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (!(e.metaKey || e.ctrlKey)) return;
                const tool = TOOLS.find((t) => "shortcut" in t && t.shortcut === e.key.toLowerCase());
                if (!tool) return;
                e.preventDefault();
                apply(tool);
              }}
              rows={16}
              className="font-mono text-[13px] leading-relaxed"
              placeholder={"## Overview\nWhat a trainee should know about this page…\n\n- Key point\n- Another\n\n> Please note: anything that must not be missed"}
              aria-label={`Text for ${title}`}
              autoFocus
            />
            <p className={tooLong ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {value.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()} characters
            </p>
          </TabsContent>
          <TabsContent value="preview" className="max-h-[55vh] overflow-y-auto border-2 border-border p-5">
            {value.trim() ? <PageText text={value} /> : (
              <p className="text-sm text-muted-foreground">Nothing written yet.</p>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving || tooLong || value === initialText} onClick={() => onSave(value)}>
            {saving ? "Saving…" : "Save text"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
