import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RegisterEdit } from "@/hooks/useRegisterStore";
import {
  cleanList, excusalReasonsOf, EXCUSAL_REASONS, GRADES, gradesOf, LIST_ITEM_MAX, LIST_MAX,
  OTHER_REASON,
} from "@/lib/register/constants";
import type { RegisterBlob, RegisterSettings } from "@/lib/register/types";

const lines = (text: string) => cleanList(text.split("\n"));
const same = (a: string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const DEFAULT_REASONS = EXCUSAL_REASONS.filter((r) => r !== OTHER_REASON);

/**
 * The lists the register's forms offer: reasons for an excused absence, and
 * the grades or roles on the sign-in form.
 *
 * They start as sensible defaults for specialty teaching and are wrong for
 * almost everything else — a nursing study day has no "ST4", a conference has
 * no "Post on-call rest". One entry per line, in the order they should appear.
 *
 * Changing a list changes what is *offered* from now on. Records already made
 * keep the words they were made with: an excusal logged as "Theatre
 * commitments" still says so after that reason is removed from the list.
 */
export function ListsPanel({
  blob, onEdit, isEvent,
}: {
  blob: RegisterBlob;
  onEdit: (edit: RegisterEdit) => void;
  isEvent: boolean;
}) {
  const savedReasons = excusalReasonsOf(blob).filter((r) => r !== OTHER_REASON);
  const savedGrades = gradesOf(blob);
  const [reasons, setReasons] = useState(savedReasons.join("\n"));
  const [grades, setGrades] = useState(savedGrades.join("\n"));

  // Follow the register when somebody else changes the lists, but never
  // overwrite what is being typed: only when the saved value itself moves.
  const reasonsKey = savedReasons.join("\n");
  const gradesKey = savedGrades.join("\n");
  useEffect(() => setReasons(reasonsKey), [reasonsKey]);
  useEffect(() => setGrades(gradesKey), [gradesKey]);

  const nextReasons = lines(reasons).filter((r) => r.toLowerCase() !== OTHER_REASON.toLowerCase());
  const nextGrades = lines(grades);
  const dirty = !same(nextReasons, savedReasons) || !same(nextGrades, savedGrades);

  const save = () => {
    if (!nextReasons.length || !nextGrades.length) {
      toast.error("Each list needs at least one entry.");
      return;
    }
    onEdit((b) => {
      const settings: RegisterSettings = { ...b.settings };
      // A list put back to the defaults is stored as "not set", so it goes on
      // following the defaults rather than freezing a copy of them.
      if (same(nextReasons, DEFAULT_REASONS)) delete settings.excusalReasons;
      else settings.excusalReasons = nextReasons;
      if (same(nextGrades, GRADES)) delete settings.grades;
      else settings.grades = nextGrades;
      return { ...b, settings };
    });
    toast.success("Lists saved.");
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Lists and default options</h2>
      <Card>
        <CardContent className="space-y-5 p-4">
          <p className="text-sm text-muted-foreground">
            What the forms offer. One entry per line, in the order they should appear — up
            to {LIST_MAX} entries of {LIST_ITEM_MAX} characters. Records already made keep
            their wording.
          </p>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="list-reasons">
                  {isEvent ? "Reasons for an apology" : "Reasons for an excused absence"}
                </Label>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs"
                  onClick={() => setReasons(DEFAULT_REASONS.join("\n"))}>
                  <RotateCcw className="mr-1 h-3 w-3" /> Defaults
                </Button>
              </div>
              <Textarea id="list-reasons" rows={10} value={reasons} spellCheck
                onChange={(e) => setReasons(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                “{OTHER_REASON}” is always offered last, with a box to type the reason.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="list-grades">Grades or roles</Label>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs"
                  onClick={() => setGrades(GRADES.join("\n"))}>
                  <RotateCcw className="mr-1 h-3 w-3" /> Defaults
                </Button>
              </div>
              <Textarea id="list-grades" rows={10} value={grades}
                onChange={(e) => setGrades(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Shown to people checking in, and when adding somebody by hand.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={!dirty}>Save lists</Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
