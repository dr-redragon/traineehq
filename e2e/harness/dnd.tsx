/**
 * A page for driving the app's drag-and-drop from a real browser.
 *
 * Reordering is not reachable from a test otherwise: every surface that has it
 * is behind sign-in and reads from Supabase. What can break, though, is neither
 * the sign-in nor the data — it is the gesture, and in particular the two
 * things a jsdom test cannot see: whether the browser takes a touch for a
 * scroll, and whether the thing under the pointer is still under the pointer a
 * second later. Both are exercised here against the real engine.
 *
 * The list below mirrors the dashboard's single-column editing mode, and the
 * second one is a drive-style list whose whole rows drag, which is the other
 * activation rule.
 *
 * Dev-server only: `vite build` builds index.html and nothing else, so this
 * never reaches a bundle. See e2e/dashboard-reorder.spec.ts.
 */
// An entry point rather than a module: it mounts and exports nothing.
/* eslint-disable react-refresh/only-export-components */
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

import { SortableWidget } from "@/components/dashboard/SortableWidget";
import {
  DragProvider, DropIndicator, moveItems, slotForEdge, useSortableItem, type DropEvent,
} from "@/lib/dnd";
import "@/index.css";

const INITIAL = ["announcements", "specialties", "registers", "bookmarks"];

/** A row that drags by its whole self, the way a drive row does. */
function PlainRow({ id, index }: { id: string; index: number }) {
  const { ref, itemProps, dragProps, dropProps, edge } = useSortableItem({ id, index });
  return (
    <div
      ref={ref}
      {...itemProps}
      {...dragProps}
      {...dropProps}
      data-testid={`row-${id}`}
      className="relative border border-border bg-card p-3 text-sm"
    >
      <DropIndicator edge={edge} />
      {id}
    </div>
  );
}

function List({ testId, handles }: { testId: string; handles: boolean }) {
  const [order, setOrder] = useState(INITIAL);

  const onDrop = ({ source, over }: DropEvent) => {
    if (!over) return;
    const slot = slotForEdge(over.index ?? 0, over.edge === "into" ? "before" : over.edge);
    setOrder((current) => moveItems(current, source.ids, slot, (id) => id));
  };

  const onKeyboardMove = (id: string, direction: -1 | 1) => {
    setOrder((current) => {
      const from = current.indexOf(id);
      const to = from + direction;
      if (from === -1 || to < 0 || to >= current.length) return current;
      return moveItems(current, [id], direction === 1 ? to + 1 : to, (each) => each);
    });
  };

  return (
    <div className="space-y-2">
      {/* The spec reads this to assert the order after a drag. */}
      <p data-testid={testId}>{order.join(",")}</p>
      <DragProvider axis="vertical" onDrop={onDrop} onKeyboardMove={onKeyboardMove}>
        <div className="space-y-2">
          {order.map((id, index) =>
            handles ? (
              <SortableWidget key={id} id={id} label={id} index={index} isEditing>
                <div data-testid={`card-${id}`} className="rounded-lg border border-dashed p-3 text-sm">
                  {id}
                </div>
              </SortableWidget>
            ) : (
              <PlainRow key={id} id={id} index={index} />
            ),
          )}
        </div>
      </DragProvider>
    </div>
  );
}

/**
 * A drive-shaped list: rows that are files, and rows that are folders.
 *
 * A folder is the one row with three answers rather than two — its edges
 * reorder it, its middle swallows what you are carrying — and which of the
 * three a drop meant is the thing worth pinning down in a real browser. The
 * log records the answer rather than rearranging anything, so the assertion is
 * about the decision itself.
 */
function FolderList() {
  const [log, setLog] = useState("");

  const onDrop = ({ source, over }: DropEvent) => {
    setLog(over ? `${source.id}:${over.edge}:${over.id}` : `${source.id}:nowhere`);
  };

  return (
    <div className="space-y-2">
      <p data-testid="drop-log">{log}</p>
      <DragProvider axis="vertical" onDrop={onDrop}>
        <div className="space-y-2">
          {["file-a", "folder-b", "file-c"].map((id, index) => (
            <DriveLikeRow key={id} id={id} index={index} folder={id.startsWith("folder")} />
          ))}
        </div>
      </DragProvider>
    </div>
  );
}

function DriveLikeRow({ id, index, folder }: { id: string; index: number; folder: boolean }) {
  const { ref, itemProps, dragProps, dropProps, edge, isOver } = useSortableItem({
    id, index, mode: folder ? "both" : "between",
  });
  return (
    <div
      ref={ref}
      {...itemProps}
      {...dragProps}
      {...dropProps}
      data-testid={`drive-${id}`}
      className={`relative border p-4 text-sm ${
        isOver && edge === "into" ? "border-rule bg-accent" : "border-border bg-card"
      }`}
    >
      <DropIndicator edge={edge} />
      {id}
    </div>
  );
}

function Harness() {
  return (
    <div className="mx-auto max-w-md space-y-8 p-4">
      <List testId="order" handles />
      <List testId="row-order" handles={false} />
      <FolderList />
      {/* Somewhere to scroll to, so a swipe has an effect worth asserting. */}
      <div style={{ height: "1400px" }} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
