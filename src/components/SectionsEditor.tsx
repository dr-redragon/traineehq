import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export interface EditableSection {
  id: string;
  name: string;
}

/**
 * One place to add, rename, delete and reorder a specialty's sections.
 *
 * The pieces all existed and were scattered: adding was a small button in the
 * rail's header, reordering was a drag nobody would guess at, and renaming and
 * deleting were behind a menu on the section's own heading — so changing the
 * shape of a specialty meant knowing three different gestures in two different
 * columns. This is the one door, reached from the rail where the sections are.
 *
 * Reordering is buttons rather than a drag. Dragging already works in the rail
 * itself for anyone who finds it, and inside a dialog a pair of arrows is
 * unambiguous, works from the keyboard, and does not fight the dialog for
 * pointer events.
 *
 * Renaming and deleting hand back to the dialogs the page already had —
 * deleting a section has to ask what happens to what is inside it, and that
 * conversation is worth having once rather than twice.
 */
export function SectionsEditor({
  open, onOpenChange, sections, countOf, busy,
  onAdd, onRename, onDelete, onReorder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: EditableSection[];
  countOf: (id: string) => number;
  busy?: boolean;
  onAdd: (name: string) => void;
  onRename: (section: EditableSection) => void;
  onDelete: (section: EditableSection) => void;
  /** The full list in its new order; the caller writes the positions. */
  onReorder: (ordered: EditableSection[]) => void;
}) {
  const [newName, setNewName] = useState("");

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(next);
  };

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    onAdd(name);
    setNewName("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit sections</DialogTitle>
          <DialogDescription>
            Add, rename, remove or reorder the sections in this specialty.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-px overflow-y-auto border-y-2 border-border py-1">
          {sections.length === 0 && (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
              No sections yet. Add the first one below.
            </p>
          )}
          {sections.map((section, index) => {
            const count = countOf(section.id);
            return (
              <div key={section.id} className="flex items-center gap-2 px-1 py-1.5 hover:bg-accent">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{section.name}</span>
                <span className="shrink-0 text-[12px] text-muted-foreground">
                  {count} item{count === 1 ? "" : "s"}
                </span>
                <div className="flex shrink-0 items-center">
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    disabled={index === 0 || busy}
                    aria-label={`Move ${section.name} up`}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    disabled={index === sections.length - 1 || busy}
                    aria-label={`Move ${section.name} down`}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    aria-label={`Rename ${section.name}`}
                    onClick={() => onRename(section)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    aria-label={`Delete ${section.name}`}
                    onClick={() => onDelete(section)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New section name…"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          />
          <Button onClick={add} disabled={!newName.trim() || busy} className="shrink-0 gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
