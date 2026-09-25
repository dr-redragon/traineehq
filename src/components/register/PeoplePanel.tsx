import type { ReactNode } from "react";
import { ExcusalsPanel } from "@/components/register/ExcusalsPanel";
import { ManagePanel } from "@/components/register/ManagePanel";
import { StatusPanel } from "@/components/register/StatusPanel";
import type { RegisterEdit } from "@/hooks/useRegisterStore";
import type { RegisterView } from "@/hooks/useRegisterView";
import type { RegisterBlob } from "@/lib/register/types";

const SECTIONS = [
  ["people-trainees", "Trainees"],
  ["people-days", "Teaching days"],
  ["people-status", "Long-term status"],
  ["people-excused", "Excused absences"],
] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 space-y-3 border-t pt-8">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Everything about who is on the register and when they count: the roster, the
 * teaching days, long-term status and excused absences.
 *
 * These were four tabs. They are one because they are the register's standing
 * data — the things set up between teaching days rather than on one — and
 * because each explains the others: a trainee missing from the grid is
 * answered by their status, an unexpected percentage by their excusals. The
 * row of links at the top jumps to each part rather than hiding the rest.
 */
export function PeoplePanel({
  blob, view, onEdit,
}: {
  blob: RegisterBlob;
  view: RegisterView;
  onEdit: (edit: RegisterEdit) => void;
}) {
  return (
    <div className="space-y-8">
      <nav aria-label="Sections" className="flex flex-wrap gap-1.5">
        {SECTIONS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={(e) => {
              // Scroll without adding the fragment: the address bar holds the
              // tab and the teaching day, and a hash would be one more thing
              // for the Back button to step through.
              e.preventDefault();
              document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {label}
          </a>
        ))}
      </nav>

      <ManagePanel blob={blob} onEdit={onEdit} canEdit />

      <Section id="people-status" title="Long-term status">
        <StatusPanel blob={blob} onEdit={onEdit} canEdit />
      </Section>

      <Section id="people-excused" title="Excused absences">
        <ExcusalsPanel blob={blob} view={view} onEdit={onEdit} canEdit />
      </Section>
    </div>
  );
}
