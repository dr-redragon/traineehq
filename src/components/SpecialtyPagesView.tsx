import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronDown, ChevronRight, FilePlus2, FolderClosed, MoreVertical, Pencil, Plus, Settings2, Trash2, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DriveBrowser } from "@/components/drive/DriveBrowser";
import { PageTextPanel } from "@/components/PageTextPanel";
import { SpecialtyContacts } from "@/components/SpecialtyContacts";
import { usePageContent } from "@/hooks/usePageContent";
import { pageTextSummary } from "@/lib/pageText";
import {
  buildPageTree, filesOnPage, flattenPageTree, owningPageId, pageFolderIds, pageTrail, type PageNode,
} from "@/lib/pageTree";
import type { Tables } from "@/integrations/supabase/types";

const CONTACTS = "contacts";

/**
 * The pages layout: the specialty as a tree of pages, each with its own text,
 * its own files and its own subpages — the shape of the deanery's site.
 *
 * It draws the same rows as the classic layout. A section is a top-level page
 * and a folder marked as a page is a subpage, so switching a specialty back to
 * classic shows every one of them again as the folder it always was.
 *
 * Where you are lives in the address (`?subsection=` and `?folder=`, the same
 * parameters search results already use), so the browser's Back button walks
 * back up the pages and a search result for a file opens the page it is on.
 */
export function SpecialtyPagesView({
  specialty, subsections, resources, folders, contacts, canManage,
  arrivalKey, onOpenedHighlighted,
  onAddSection, onEditSections, onRenameSection, onDeleteSection,
}: {
  specialty: Tables<"specialties">;
  subsections: Tables<"subsections">[];
  resources: Tables<"resources">[];
  folders: Tables<"resource_folders">[];
  contacts: Tables<"contacts">[];
  canManage: boolean;
  arrivalKey?: string;
  onOpenedHighlighted?: () => void;
  onAddSection: (name: string) => void;
  onEditSections: () => void;
  onRenameSection: (section: Tables<"subsections">) => void;
  onDeleteSection: (section: Tables<"subsections">) => void;
}) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addSubpage, renameFolder, setIsPage } = usePageContent(specialty.id);

  const tree = useMemo(() => buildPageTree(subsections, folders), [subsections, folders]);
  const hiddenFolders = useMemo(() => pageFolderIds(folders), [folders]);

  /* ---------- Where we are ---------- */
  const showingContacts = searchParams.get("view") === CONTACTS;
  const section = subsections.find((s) => s.id === searchParams.get("subsection")) ?? subsections[0];
  const folderParam = searchParams.get("folder");
  const folderInSection = folderParam && folders.some((f) => f.id === folderParam && f.subsection_id === section?.id)
    ? folderParam : null;
  const pageFolderId = owningPageId(folders, folderInSection);
  const pageFolder = pageFolderId ? folders.find((f) => f.id === pageFolderId) ?? null : null;
  const currentId = pageFolderId ?? section?.id ?? "";
  const trail = pageTrail(tree, currentId);
  const node = trail[trail.length - 1];

  /** Go to a page. Pushes, so Back returns to the page before. */
  const go = (target: PageNode | typeof CONTACTS) => {
    const next = new URLSearchParams();
    if (target === CONTACTS) next.set("view", CONTACTS);
    else {
      next.set("subsection", target.subsectionId);
      if (target.kind === "folder") next.set("folder", target.id);
    }
    navigate({ search: `?${next}` });
  };

  /* ---------- The rail ---------- */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // The way down to the open page is always unfolded.
  useEffect(() => {
    if (!trail.length) return;
    setExpanded((open) => {
      const missing = trail.filter((n) => n.children.length && !open.has(n.id));
      if (!missing.length) return open;
      const next = new Set(open);
      missing.forEach((n) => next.add(n.id));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, tree]);

  const countFor = (n: PageNode) => filesOnPage(folders, resources, n);

  const renderNode = (n: PageNode): React.ReactNode => {
    const active = !showingContacts && n.id === currentId;
    const open = expanded.has(n.id);
    return (
      <li key={n.id}>
        <div
          className={cn(
            "flex items-center border-l-[3px] transition-colors",
            active ? "border-l-[hsl(var(--rule-accent))] bg-accent/60" : "border-l-transparent hover:bg-accent",
          )}
          style={{ paddingLeft: `${8 + n.depth * 16}px` }}
        >
          {n.children.length ? (
            <button
              type="button"
              className="flex h-8 w-6 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={open ? `Collapse ${n.name}` : `Expand ${n.name}`}
              aria-expanded={open}
              onClick={() =>
                setExpanded((s) => {
                  const next = new Set(s);
                  if (next.has(n.id)) next.delete(n.id); else next.add(n.id);
                  return next;
                })
              }
            >
              {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="w-6 shrink-0" aria-hidden />
          )}
          <button
            type="button"
            onClick={() => go(n)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-1 items-baseline justify-between gap-2.5 py-2 pr-5 text-left text-[13.5px]",
              active ? "font-bold text-foreground" : n.depth === 0 ? "font-medium" : "text-foreground/85",
            )}
          >
            <span className="min-w-0 truncate">{n.name}</span>
            <span className="shrink-0 text-[12px] font-normal text-muted-foreground">{countFor(n)}</span>
          </button>
        </div>
        {open && n.children.length > 0 && <ul>{n.children.map(renderNode)}</ul>}
      </li>
    );
  };

  /* ---------- Dialogs ---------- */
  const [addOpen, setAddOpen] = useState<null | "section" | "subpage">(null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const submitAdd = () => {
    const name = newName.trim();
    if (!name) return;
    if (addOpen === "section") {
      onAddSection(name);
      setAddOpen(null);
      setNewName("");
      return;
    }
    if (!section || !node) return;
    addSubpage.mutate(
      { subsectionId: section.id, parentFolderId: pageFolderId, name, sortOrder: node.children.length },
      {
        onSuccess: (id) => {
          setAddOpen(null);
          setNewName("");
          go({ kind: "folder", id, subsectionId: section.id, name, depth: node.depth + 1, children: [] });
        },
      },
    );
  };

  /* ---------- Page body ---------- */
  const sectionResources = section ? resources.filter((r) => r.subsection_id === section.id) : [];
  const sectionFolders = section ? folders.filter((f) => f.subsection_id === section.id) : [];
  const openFolderId = folderInSection && folderInSection !== pageFolderId ? folderInSection : null;
  const textRow = pageFolder ?? section;

  const pagePicker = (
    <div className="flex items-center gap-2 px-5 lg:hidden">
      <Select
        value={showingContacts ? CONTACTS : currentId}
        onValueChange={(v) => {
          if (v === CONTACTS) { go(CONTACTS); return; }
          const target = flattenPageTree(tree).find((n) => n.id === v);
          if (target) go(target);
        }}
      >
        <SelectTrigger className="min-w-0 flex-1" aria-label="Choose a page">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {flattenPageTree(tree).map((n) => (
            <SelectItem key={n.id} value={n.id}>
              {" ".repeat(n.depth * 2)}{n.name} ({countFor(n)})
            </SelectItem>
          ))}
          <SelectItem value={CONTACTS}>Key Contacts ({contacts.length})</SelectItem>
        </SelectContent>
      </Select>
      {canManage && (
        <Button variant="outline" size="icon" className="shrink-0" aria-label="Edit sections" onClick={onEditSections}>
          <Settings2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  return (
    <div className="grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <nav aria-label={`Pages in ${specialty.short_name}`} className="min-w-0 border-b-2 border-border py-5 lg:border-b-0 lg:border-r-2">
        <div className="px-5 pb-2.5">
          <p className="ds-kicker">Pages</p>
        </div>
        {pagePicker}
        <ul className="hidden lg:block">
          {tree.map(renderNode)}
          <li>
            <button
              type="button"
              onClick={() => go(CONTACTS)}
              aria-current={showingContacts ? "page" : undefined}
              className={cn(
                "flex w-full items-baseline justify-between gap-2.5 border-l-[3px] py-2 pl-[38px] pr-5 text-left text-[13.5px] transition-colors",
                showingContacts ? "border-l-[hsl(var(--rule-accent))] bg-accent/60 font-bold" : "border-l-transparent font-medium hover:bg-accent",
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Users className="h-3 w-3 shrink-0" /> Key Contacts
              </span>
              <span className="shrink-0 text-[12px] font-normal text-muted-foreground">{contacts.length}</span>
            </button>
          </li>
        </ul>
        {canManage && (
          <div className="mt-2 hidden lg:block">
            <button
              type="button"
              onClick={() => { setNewName(""); setAddOpen("section"); }}
              className="flex w-full items-center gap-1.5 px-5 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus className="h-3 w-3 shrink-0" /> Add page
            </button>
            <button
              type="button"
              onClick={onEditSections}
              className="flex w-full items-center gap-1.5 px-5 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Settings2 className="h-3 w-3 shrink-0" /> Edit top-level pages
            </button>
          </div>
        )}
      </nav>

      <div className="flex min-w-0 flex-col gap-8 px-5 pb-12 pt-7 sm:px-9">
        {showingContacts ? (
          <SpecialtyContacts specialty={specialty} contacts={contacts} canManage={canManage} />
        ) : !section || !node ? (
          <div className="space-y-3 py-12 text-center text-muted-foreground">
            <p>No pages yet.</p>
            {canManage && (
              <Button onClick={() => { setNewName(""); setAddOpen("section"); }} className="gap-1.5">
                <Plus className="h-4 w-4" /> Add the first page
              </Button>
            )}
          </div>
        ) : (
          <>
            <header className="space-y-1.5">
              {trail.length > 1 && (
                <nav aria-label="Page path" className="flex flex-wrap items-center gap-1 text-[13px] text-muted-foreground">
                  {trail.slice(0, -1).map((n) => (
                    <span key={n.id} className="flex items-center gap-1">
                      <button type="button" className="hover:text-foreground hover:underline" onClick={() => go(n)}>{n.name}</button>
                      <ChevronRight className="h-3 w-3" aria-hidden />
                    </span>
                  ))}
                  <span className="font-semibold text-foreground" aria-current="page">{node.name}</span>
                </nav>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 flex-1 font-display text-[clamp(22px,3vw,30px)] font-extrabold leading-tight tracking-[-0.02em]">
                  {node.name}
                </h2>
                {canManage && (
                  <>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => { setNewName(""); setAddOpen("subpage"); }}>
                      <FilePlus2 className="h-3.5 w-3.5" /> Add subpage
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`More for ${node.name}`}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem
                          onClick={() => {
                            if (pageFolder) { setRenameValue(pageFolder.name); setRenaming(true); }
                            else onRenameSection(section);
                          }}
                        >
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Rename page
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {pageFolder ? (
                          // A subpage is a folder; taking the page away leaves the
                          // folder and everything in it among its parent's files,
                          // where the drive's own menu can move or delete it.
                          <DropdownMenuItem
                            onClick={() =>
                              setIsPage.mutate(
                                { folderId: pageFolder.id, isPage: false },
                                { onSuccess: () => trail.length > 1 && go(trail[trail.length - 2]) },
                              )
                            }
                          >
                            <FolderClosed className="mr-2 h-3.5 w-3.5" /> Turn back into a folder
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem className="text-destructive" onClick={() => onDeleteSection(section)}>
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete page
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            </header>

            {textRow && (
              <PageTextPanel
                key={textRow.id}
                specialtyId={specialty.id}
                target={pageFolder ? { kind: "folder", id: pageFolder.id } : { kind: "section", id: section.id }}
                name={node.name}
                body={textRow.body}
                updatedAt={textRow.body_updated_at}
                canManage={canManage}
                variant="page"
              />
            )}

            <section aria-labelledby="page-files" className="space-y-2">
              <h3 id="page-files" className="ds-kicker text-foreground">Files on this page</h3>
              <DriveBrowser
                key={currentId}
                subsection={section}
                specialtyId={specialty.id}
                rootFolderId={pageFolderId}
                hiddenFolderIds={hiddenFolders}
                openFolderId={openFolderId}
                highlightId={searchParams.get("highlight")}
                openHighlighted={searchParams.get("open") === "1"}
                arrivalKey={arrivalKey}
                onOpenedHighlighted={onOpenedHighlighted}
                resources={sectionResources}
                folders={sectionFolders}
                categories={subsections.map((s) => ({ id: s.id, name: s.name }))}
                allFolders={folders}
                canManage={canManage}
                renderIntro={(folder) =>
                  folder ? (
                    <PageTextPanel
                      key={folder.id}
                      specialtyId={specialty.id}
                      target={{ kind: "folder", id: folder.id }}
                      name={folder.name}
                      body={folder.body}
                      updatedAt={folder.body_updated_at}
                      isPage={folder.is_page}
                      canManage={canManage}
                      variant="panel"
                    />
                  ) : null
                }
              />
            </section>

            {node.children.length > 0 && (
              <section aria-labelledby="page-children" className="space-y-3">
                <h3 id="page-children" className="ds-kicker border-b-2 border-foreground pb-2 text-foreground">
                  In {node.name}
                </h3>
                <div className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
                  {node.children.map((child) => {
                    const row = folders.find((f) => f.id === child.id);
                    const summary = pageTextSummary(row?.body, 110);
                    const files = countFor(child);
                    return (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => go(child)}
                        className="flex min-h-[96px] flex-col gap-1 border-t-[3px] border-foreground bg-card p-4 text-left transition-colors hover:border-[hsl(var(--rule-accent))] hover:bg-accent"
                      >
                        <span className="font-display text-[15px] font-bold">{child.name}</span>
                        {summary && <span className="text-[13px] leading-snug text-muted-foreground">{summary}</span>}
                        <span className="mt-auto pt-1 text-[12px] text-muted-foreground">
                          {files} file{files === 1 ? "" : "s"}
                          {child.children.length > 0 && ` · ${child.children.length} subpage${child.children.length === 1 ? "" : "s"}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <Dialog open={!!addOpen} onOpenChange={(o) => { if (!o) setAddOpen(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{addOpen === "section" ? "Add a page" : `Add a subpage to ${node?.name ?? ""}`}</DialogTitle>
            <DialogDescription>
              {addOpen === "section"
                ? "A top-level page. In the classic layout it is a section."
                : "A page inside this one, with its own text and files. In the classic layout it is a folder."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 pt-2">
            <Label htmlFor="new-page-name">Page name</Label>
            <Input
              id="new-page-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Dates & Form R"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitAdd(); } }}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAddOpen(null)}>Cancel</Button>
            <Button disabled={!newName.trim() || addSubpage.isPending} onClick={submitAdd}>
              {addSubpage.isPending ? "Adding…" : "Add page"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename page</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 pt-2">
            <Label htmlFor="rename-page">New name</Label>
            <Input
              id="rename-page"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameValue.trim() && pageFolder) {
                  renameFolder.mutate({ folderId: pageFolder.id, name: renameValue.trim() }, { onSuccess: () => setRenaming(false) });
                }
              }}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRenaming(false)}>Cancel</Button>
            <Button
              disabled={!renameValue.trim() || renameFolder.isPending}
              onClick={() => pageFolder && renameFolder.mutate({ folderId: pageFolder.id, name: renameValue.trim() }, { onSuccess: () => setRenaming(false) })}
            >
              {renameFolder.isPending ? "Saving…" : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
