import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { CELL_DOT, CELL_LABEL } from "@/components/register/attendanceCell";
import { formatMonth } from "@/lib/register/months";
import type { CellState } from "@/lib/register/eligibility";
import type { RegisterSession, RegisterTrainee } from "@/lib/register/types";
import { cn } from "@/lib/utils";

const GAP = 10;
const EDGE = 12;

/**
 * What one attendance cell says when it is tapped.
 *
 * On a phone there is no hover, so the grid's marks are unlabelled squares:
 * which teaching day a column is, and what a given square means, are both
 * invisible. Worse, the tap that would have shown a tooltip on a desktop
 * instead flipped somebody's attendance — a mis-tap on a 28px target silently
 * rewrote the register, and the person doing it had no way to see it happen.
 *
 * So a tap opens this and changes nothing. Changing it takes a second,
 * deliberate press on a button that says what it will do.
 *
 * Positioned by hand rather than with the shared Radix popover, and the reason
 * is the grid: a register of thirty trainees over a year is several hundred
 * cells, and a popover component per cell is several hundred subscriptions to
 * carry so that one of them can be open. This is one element, mounted only
 * while it is open, and it is the shape the standalone register used too.
 */
export function AttendanceCellPopover({
  anchor, trainee, session, state, grade, canEdit, onToggle, onClose,
}: {
  /** The cell this belongs to. Its position on screen is the only thing read. */
  anchor: HTMLElement;
  trainee: RegisterTrainee;
  session: RegisterSession;
  state: CellState;
  /** The grade recorded at this check-in, if there is one. */
  grade: string;
  canEdit: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<{ top: number; left: number } | null>(null);

  const close = useCallback(() => onClose(), [onClose]);

  // Measured after the first paint, because where it goes depends on how tall
  // it turned out to be: below the cell, or above it when there is no room.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const cell = anchor.getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = el;

    const left = Math.max(EDGE, Math.min(
      cell.left + cell.width / 2 - w / 2, window.innerWidth - w - EDGE,
    ));
    const below = cell.bottom + GAP;
    const top = below + h > window.innerHeight - EDGE
      ? Math.max(EDGE, cell.top - h - GAP)
      : below;

    setPlaced({ top, left });
  }, [anchor]);

  /*
   * Dismissal. Scroll and resize close it rather than moving it: it is
   * positioned against where the cell was, and a popover left floating beside
   * the wrong column is worse than one that has gone.
   *
   * Attached on the next frame so that the tap which opened it — whose `click`
   * is still being handled as this mounts — cannot also close it.
   */
  useEffect(() => {
    let cancelled = false;

    const onPointerDown = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };

    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("keydown", onKeyDown, true);
      // Capturing, so a scroll of the grid's own horizontal strip counts too.
      window.addEventListener("scroll", close, true);
      window.addEventListener("resize", close);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [close]);

  // Focus lands on the popover itself rather than its button: a screen reader
  // then reads the details before the action, which is the order they matter
  // in, and Escape works without anything being tabbed to first.
  useEffect(() => { box.current?.focus(); }, []);

  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-modal="false"
      aria-label={`${trainee.name} — ${session.title}`}
      tabIndex={-1}
      style={{
        position: "fixed",
        top: placed?.top ?? 0,
        left: placed?.left ?? 0,
        // Invisible for the one frame before it is measured, rather than
        // flashing in the top-left corner on the way to where it belongs.
        visibility: placed ? "visible" : "hidden",
      }}
      className={cn(
        "z-50 w-[min(17rem,calc(100vw-1.5rem))] rounded-xl border bg-popover p-3.5",
        "text-popover-foreground shadow-lg outline-none",
      )}
    >
      <p className="text-sm font-semibold leading-snug">{session.title}</p>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {formatMonth(session.month, "en-GB")}
      </p>

      <div className="mt-2.5 flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn("h-2.5 w-2.5 shrink-0 rounded-full", CELL_DOT[state])}
        />
        <p className="min-w-0 text-sm">
          <span className="font-medium">{trainee.name}</span> — {CELL_LABEL[state]}
          {grade ? ` · ${grade}` : ""}
        </p>
      </div>

      {state === "na" ? (
        <p className="mt-2.5 text-xs text-muted-foreground">
          Not in the programme for this teaching day, so it counts neither way. Change it under
          Long-term status, not here.
        </p>
      ) : (
        <>
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="flex-1" disabled={!canEdit} onClick={onToggle}>
              {state === "present" ? "Mark absent" : "Mark attended"}
            </Button>
            <Button size="sm" variant="outline" onClick={close}>Close</Button>
          </div>
          {state === "excused" && (
            <p className="mt-2.5 text-xs text-muted-foreground">
              Excused — this teaching day is already out of their denominator. Marking them
              attended does not remove the excuse.
            </p>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}
