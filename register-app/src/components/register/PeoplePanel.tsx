import { useEffect } from "react";
import { ExcusalsPanel } from "@/components/register/ExcusalsPanel";
import { ManagePanel } from "@/components/register/ManagePanel";
import { StatusPanel } from "@/components/register/StatusPanel";
import { SubTabs } from "@/components/register/SubTabs";
import type { RegisterEdit } from "@/hooks/useRegisterStore";
import type { PeopleSectionId, RegisterView } from "@/hooks/useRegisterView";
import type { RegisterBlob } from "@/lib/register/types";

/**
 * Everything about who is on the register and when they count: the roster,
 * long-term status and excused absences. (The list of days lives on the day
 * tab, as "Manage days".)
 *
 * An event register has no long-term status: maternity leave, out-of-programme
 * time and CCT dates are about a programme that runs for years, and mean
 * nothing for a study day. The section is left out there altogether.
 *
 * Each is a sub-tab of its own rather than one long page, with its "add" form
 * open at the top. The one showing is kept in the address bar (`?section=`), so
 * a refresh or a shared link lands on the same part.
 */
export function PeoplePanel({
  blob, view, onEdit, canEdit = true, isEvent = false,
}: {
  blob: RegisterBlob;
  view: RegisterView;
  onEdit: (edit: RegisterEdit) => void;
  canEdit?: boolean;
  isEvent?: boolean;
}) {
  const counts: Record<PeopleSectionId, number> = {
    trainees: blob.trainees.length,
    status: blob.status.filter((s) => s.type !== "active").length,
    excused: blob.excused.length,
  };

  const sections: [PeopleSectionId, string][] = isEvent
    ? [["trainees", "Attendees"], ["excused", "Apologies"]]
    : [["trainees", "Trainees"], ["status", "Long-term status"], ["excused", "Excused absences"]];

  // A link to ?section=status on an event register lands on the roster.
  const hidden = isEvent && view.section === "status";
  const { setSection } = view;
  useEffect(() => {
    if (hidden) setSection("trainees");
  }, [hidden, setSection]);
  const section = hidden ? "trainees" : view.section;

  return (
    <div className="space-y-5">
      <SubTabs
        label="People"
        items={sections.map(([id, label]) => ({ id, label, count: counts[id] }))}
        value={section}
        onChange={view.setSection}
      />

      <div role="tabpanel">
        {section === "trainees" && <ManagePanel part="trainees" blob={blob} onEdit={onEdit} canEdit={canEdit} isEvent={isEvent} />}
        {section === "status" && <StatusPanel blob={blob} onEdit={onEdit} canEdit={canEdit} />}
        {section === "excused" && <ExcusalsPanel blob={blob} view={view} onEdit={onEdit} canEdit={canEdit} />}
      </div>
    </div>
  );
}
