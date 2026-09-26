import { ExcusalsPanel } from "@/components/register/ExcusalsPanel";
import { ManagePanel } from "@/components/register/ManagePanel";
import { StatusPanel } from "@/components/register/StatusPanel";
import type { RegisterEdit } from "@/hooks/useRegisterStore";
import type { PeopleSectionId, RegisterView } from "@/hooks/useRegisterView";
import type { RegisterBlob } from "@/lib/register/types";
import { cn } from "@/lib/utils";

const SECTIONS: [PeopleSectionId, string][] = [
  ["trainees", "Trainees"],
  ["days", "Teaching days"],
  ["status", "Long-term status"],
  ["excused", "Excused absences"],
];

/**
 * Everything about who is on the register and when they count: the roster, the
 * teaching days, long-term status and excused absences.
 *
 * Each is a sub-tab of its own rather than one long page, with its "add" form
 * open at the top. The one showing is kept in the address bar (`?section=`), so
 * a refresh or a shared link lands on the same part.
 */
export function PeoplePanel({
  blob, view, onEdit,
}: {
  blob: RegisterBlob;
  view: RegisterView;
  onEdit: (edit: RegisterEdit) => void;
}) {
  const counts: Record<PeopleSectionId, number> = {
    trainees: blob.trainees.length,
    days: blob.sessions.length,
    status: blob.status.filter((s) => s.type !== "active").length,
    excused: blob.excused.length,
  };

  return (
    <div className="space-y-5">
      {/* The same ruled segmented control as the academic-year picker, so the
          register has one look for "pick one of these". */}
      <div
        role="tablist"
        aria-label="People"
        className="inline-flex max-w-full flex-wrap border-2 border-foreground"
      >
        {SECTIONS.map(([id, label]) => {
          const on = view.section === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => view.setSection(id)}
              className={cn(
                "inline-flex h-8 select-none touch-manipulation items-center gap-1.5 px-3 text-[13px] transition-colors",
                on
                  ? "bg-foreground font-bold text-background"
                  : "font-normal text-foreground hover:bg-accent",
              )}
            >
              {label}
              <span className={cn("tabular-nums", on ? "opacity-70" : "text-muted-foreground")}>
                {counts[id]}
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {view.section === "trainees" && <ManagePanel part="trainees" blob={blob} onEdit={onEdit} canEdit />}
        {view.section === "days" && <ManagePanel part="days" blob={blob} onEdit={onEdit} canEdit />}
        {view.section === "status" && <StatusPanel blob={blob} onEdit={onEdit} canEdit />}
        {view.section === "excused" && <ExcusalsPanel blob={blob} view={view} onEdit={onEdit} canEdit />}
      </div>
    </div>
  );
}
