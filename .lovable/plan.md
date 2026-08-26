## Goal
Rebuild the resource management UI on `SpecialtyDetail` (and related folder views) to look and behave like Google Drive: a single unified list/grid of files and folders, double‑click to open, right‑click context menu, breadcrumb navigation, multi‑select with checkbox+shift+click, and smooth drag‑and‑drop for moving files between folders, out of folders, and across sections.

## Scope
**In scope (UI/UX only, no schema changes):**
- `src/pages/SpecialtyDetail.tsx` — replace the current "subheading groups + folders + cards" layout with a Drive‑style file browser.
- `src/components/ResourceFolder.tsx`, `ResourceCard.tsx`, `SubheadingGroup.tsx`, `DroppableSubheadingGroup.tsx`, `BulkActionBar.tsx` — rebuild as Drive‑style primitives.
- New components: `DriveBrowser`, `DriveRow`/`DriveTile`, `DriveBreadcrumb`, `DriveContextMenu`, `DriveToolbar`.
- Keep using existing `dnd-kit` setup but with a cleaner collision strategy and a single `DragOverlay`.

**Out of scope:**
- Database schema, RLS, upload pipeline, download logic, edge functions, admin panel.
- Subsections (tabs) themselves — they remain as the top‑level "sections" switcher.

## Drive‑style behaviors to implement
1. **Unified browser view per subsection**
   - One area showing folders first, then files, in either *List* or *Grid* mode (toggle in toolbar, persisted to localStorage).
   - Subheadings render as collapsible section headers inside the same list (not separate boxed cards) so files can be dragged across them freely.

2. **Navigation**
   - Double‑click (or Enter) on a folder opens it — view switches to that folder's contents, breadcrumb appended.
   - Breadcrumb: `Specialty › Subsection › Folder ▸ Subfolder` (we currently support one folder level; breadcrumb degrades gracefully).
   - Back / parent navigation via breadcrumb or `Esc`.

3. **Selection**
   - Click selects, `Shift+Click` range‑selects, `Cmd/Ctrl+Click` toggles.
   - Checkbox appears on hover / when any item selected.
   - Selection bar (existing `BulkActionBar`) restyled into a Drive‑style floating action bar with: Move, Download, Delete.

4. **Drag & drop**
   - Drag any selection (1 or N items) onto a folder row/tile → moves into that folder (works in both root and inside‑folder views).
   - Drag onto breadcrumb segment → moves to that ancestor (e.g. drop on subsection name to move out of folder).
   - Drag onto a subheading header → re‑assigns subheading.
   - Visual: ghost pill "Move N items to <target>", target row highlighted with Drive‑blue ring, auto‑scroll near edges.
   - Single `DragOverlay`, `pointerWithin` collision, drop targets resolved at container level so hovering a child card still hits the parent folder.

5. **Context menu** (right‑click on row)
   - Open, Download, Rename, Move to…, Delete, Copy link.
   - Same menu accessible via row's ⋮ button.

6. **Toolbar**
   - `+ New ▾` button (Folder / Upload files / Upload folder).
   - View toggle (List / Grid), Sort menu (Name, Modified, Type), Search‑in‑section input.

7. **Empty states + drop overlay**
   - Dotted full‑area drop overlay when OS files dragged anywhere over the browser.
   - Empty folder: centered illustration + "Drop files here or click + New".

## Files plan
**New:**
- `src/components/drive/DriveBrowser.tsx` — orchestrator: state for currentFolder, selection, view mode, sort, dnd context.
- `src/components/drive/DriveRow.tsx` / `DriveTile.tsx` — file/folder presentation (sortable + droppable for folders).
- `src/components/drive/DriveBreadcrumb.tsx` — breadcrumb with droppable segments.
- `src/components/drive/DriveToolbar.tsx` — New menu, view toggle, sort, search.
- `src/components/drive/DriveContextMenu.tsx` — wraps rows with shadcn `ContextMenu`.
- `src/components/drive/DriveSelectionBar.tsx` — floating action bar (replaces BulkActionBar styling).
- `src/components/drive/useDriveSelection.ts` — selection hook (click/shift/ctrl logic).

**Rewritten / simplified:**
- `src/pages/SpecialtyDetail.tsx` — per subsection tab, render `<DriveBrowser subsectionId=… />`. Keeps tabs, header, notice board, discussions, admin dialogs.
- `ResourceFolder.tsx`, `SubheadingGroup.tsx`, `DroppableSubheadingGroup.tsx`, `ResourceCard.tsx`, `BulkActionBar.tsx` — deleted or trimmed to thin wrappers re‑exported from drive components. Existing dialogs (`AddResourceDialog`, `EditResourceDialog`, `AddFolderDialog`) reused as‑is.

## Technical notes
- All move mutations reuse existing Supabase updates (`resources.folder_id`, `resources.subheading`, `resource_folders.subheading`) — no SQL changes.
- dnd-kit: one `<DndContext>` at `DriveBrowser` root, `pointerWithin` + `rectIntersection` fallback, `DragOverlay` shows a Drive‑style pill ("📄 file.pdf" or "3 items").
- Drop target IDs: `folder:<id>`, `subheading:<name>`, `breadcrumb:root`, `breadcrumb:subsection`.
- View mode + sort persisted in `localStorage` per subsection.
- Keyboard: `Enter` opens folder, `Esc` goes back, `Delete` deletes selection (with confirm), `Cmd/Ctrl+A` selects all.

## What will visibly change for the user
- The current "boxed folder cards with internal lists" disappears; folders become single‑line rows you double‑click to enter.
- Files and folders live together in one list/grid with consistent row styling.
- Moving files becomes seamless: drag onto any folder row or onto the breadcrumb to go up a level.
- A persistent toolbar with New / View / Sort, and a floating action bar when items are selected.

## Out‑of‑scope items I will NOT touch
- Upload / download mechanics, edge functions, RLS, schema.
- Tabs (subsections), AdminPanel, attendance, discussions UI.

Shall I proceed with this plan?