import { useState } from "react";
import { ChevronDown, ChevronUp, FileText, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageText } from "@/components/PageText";
import { PageTextEditor } from "@/components/PageTextEditor";
import { usePageContent, type PageTarget } from "@/hooks/usePageContent";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/**
 * The text at the top of a section or folder, and the controls to write it.
 *
 * `panel` is the classic layout's: a quiet band above the drive that can be
 * folded away, since there the files are still the main thing. `page` is the
 * pages layout's, where the text is the page and sits open, unboxed.
 *
 * Nothing is drawn for a trainee when there is no text; whoever can edit gets
 * a single "Add text" line instead.
 */
export function PageTextPanel({
  specialtyId, target, name, body, updatedAt, isPage, canManage, variant,
}: {
  specialtyId: string;
  target: PageTarget;
  name: string;
  body: string | null | undefined;
  updatedAt?: string | null;
  /** For a folder: whether it is listed as a subpage. Leave out for a section. */
  isPage?: boolean;
  canManage: boolean;
  variant: "panel" | "page";
}) {
  const { saveText, setIsPage } = usePageContent(specialtyId);
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const hasText = !!body?.trim();

  if (!hasText && !canManage) return null;

  // Only on a folder seen as a folder. On a page the switch would read as
  // "this page is not a page"; its menu has "Turn back into a folder" instead.
  const pageToggle = canManage && target.kind === "folder" && variant === "panel" && (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
      <Switch
        checked={!!isPage}
        disabled={setIsPage.isPending}
        onCheckedChange={(checked) => setIsPage.mutate({ folderId: target.id, isPage: checked })}
        aria-label={`List ${name} as a subpage`}
      />
      Subpage in the pages layout
    </label>
  );

  const editor = (
    <PageTextEditor
      open={editing}
      onOpenChange={setEditing}
      title={name}
      initialText={body ?? ""}
      saving={saveText.isPending}
      onSave={(text) => saveText.mutate({ target, body: text }, { onSuccess: () => setEditing(false) })}
    />
  );

  if (!hasText) {
    return (
      <div className={cn("flex flex-wrap items-center justify-between gap-3", variant === "panel" && "border-2 border-dashed border-border px-4 py-2.5")}>
        <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 text-xs text-muted-foreground" onClick={() => setEditing(true)}>
          <FileText className="h-3.5 w-3.5" /> Add text to {name}
        </Button>
        {pageToggle}
        {editor}
      </div>
    );
  }

  const meta = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {updatedAt && <span className="text-xs text-muted-foreground">Updated {formatDate(updatedAt)}</span>}
      {canManage && (
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" /> Edit text
        </Button>
      )}
      {pageToggle}
    </div>
  );

  if (variant === "page") {
    return (
      <section aria-label={`About ${name}`} className="space-y-3">
        <PageText text={body} />
        {meta}
        {editor}
      </section>
    );
  }

  return (
    <section aria-label={`About ${name}`} className="border-t-[3px] border-foreground bg-card px-5 pb-4 pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="ds-kicker">About {name}</p>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs text-muted-foreground"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          {collapsed ? "Show" : "Hide"}
        </Button>
      </div>
      {!collapsed && (
        <div className="mt-2 space-y-3">
          <PageText text={body} />
          {meta}
        </div>
      )}
      {editor}
    </section>
  );
}
