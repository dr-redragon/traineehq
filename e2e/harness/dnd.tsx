/**
 * A page for driving the dashboard's drag-and-drop from a real browser.
 *
 * Reordering widgets is not reachable from a test otherwise: the dashboard is
 * behind sign-in and every widget on it reads from Supabase. What broke on
 * phones, though, was neither the dashboard nor the data — it was the sensor
 * configuration and the handle. Both are imported here for real, and the wiring
 * around them mirrors the dashboard's single-column editing mode.
 *
 * Dev-server only: `vite build` builds index.html and nothing else, so this
 * never reaches a bundle. See e2e/dashboard-reorder.spec.ts.
 */
// An entry point rather than a module: it mounts and exports nothing.
/* eslint-disable react-refresh/only-export-components */
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SortableWidget } from "@/components/dashboard/SortableWidget";
import { useDragSensors } from "@/hooks/useDragSensors";
import "@/index.css";

const INITIAL = ["announcements", "specialties", "registers", "bookmarks"];

function Harness() {
  const [order, setOrder] = useState(INITIAL);
  const sensors = useDragSensors();

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setOrder((current) =>
      arrayMove(current, current.indexOf(String(active.id)), current.indexOf(String(over.id))),
    );
  };

  return (
    <div className="mx-auto max-w-md space-y-2 p-4">
      {/* The spec reads this to assert the order after a drag. */}
      <p data-testid="order">{order.join(",")}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {order.map((id) => (
              <SortableWidget key={id} id={id} label={id} isEditing>
                <div data-testid={`card-${id}`} className="rounded-lg border border-dashed p-3 text-sm">
                  {id}
                </div>
              </SortableWidget>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
