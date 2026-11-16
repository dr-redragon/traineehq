import { ExcusalsPanel } from "@/components/register/ExcusalsPanel";
import { ManagePanel } from "@/components/register/ManagePanel";
import { StatusPanel } from "@/components/register/StatusPanel";
import { SubTabs } from "@/components/register/SubTabs";
import type { RegisterEdit } from "@/hooks/useRegisterStore";
import type { PeopleSectionId, RegisterView } from "@/hooks/useRegisterView";
import type { RegisterBlob } from "@/lib/register/types";

const SECTIONS: [PeopleSectionId, string][] = [
  ["trainees", "Trainees"],
  ["status", "Long-term status"],
  ["excused", "Excused absences"],
];

/**
 * Everything about who is on the register and when they count: the roster,
 * long-term status and excused absences. (The list of teaching days lives on
 * the Teaching day tab, as "Manage days".)
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
    status: blob.status.filter((s) => s.type !== "active").length,
    excused: blob.excused.length,
  };

  return (
    <div className="space-y-5">
      <SubTabs
        label="People"
        items={SECTIONS.map(([id, label]) => ({ id, label, count: counts[id] }))}
        value={view.section}
        onChange={view.setSection}
      />

      <div role="tabpanel">
        {view.section === "trainees" && <ManagePanel part="trainees" blob={blob} onEdit={onEdit} canEdit />}
        {view.section === "status" && <StatusPanel blob={blob} onEdit={onEdit} canEdit />}
        {view.section === "excused" && <ExcusalsPanel blob={blob} view={view} onEdit={onEdit} canEdit />}
      </div>
    </div>
  );
}
