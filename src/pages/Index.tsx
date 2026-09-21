import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Clock, FileText, Video, LinkIcon, BookOpen, CheckSquare,
  FolderOpen, ChevronRight, Settings2, Eye, EyeOff, X, Columns2, Rows3,
  ArrowLeftRight, Cog,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getIcon } from "@/lib/iconMap";
import { useCurrentUser } from "@/hooks/useUserRole";
import { useProfile } from "@/hooks/useProfile";
import { useDeanery } from "@/contexts/DeaneryContext";
import { useDashboardPreferences, type WidgetId } from "@/hooks/useDashboardPreferences";
import { BookmarksWidget } from "@/components/dashboard/BookmarksWidget";
import { WatchedDiscussionsWidget } from "@/components/dashboard/WatchedDiscussionsWidget";
import { StarredContactsWidget } from "@/components/dashboard/StarredContactsWidget";
import { SpecialtiesWidget } from "@/components/dashboard/SpecialtiesWidget";
import { RegistersWidget } from "@/components/dashboard/RegistersWidget";
import { RecentResourcesWidget } from "@/components/dashboard/RecentResourcesWidget";
import { FileBrowserWidget } from "@/components/dashboard/FileBrowserWidget";
import { FileBrowserWidgetSettings } from "@/components/dashboard/FileBrowserWidgetSettings";
import { DragProvider, slotForEdge, useDropTarget, type DropEvent } from "@/lib/dnd";
import { SortableWidget } from "@/components/dashboard/SortableWidget";
import { planWidgetDrop } from "@/lib/dashboardLayout";

const WIDGET_LABELS: Record<WidgetId, string> = {
  announcements: "Announcements",
  specialties: "Your Specialties",
  registers: "Teaching Registers",
  file_browser: "Quick Files",
  bookmarks: "Bookmarked Resources",
  recent_resources: "Recently Added",
  watched_discussions: "Watched Discussions",
  contacts: "Key Contacts",
};

/**
 * A column of widgets, and somewhere to drop one that belongs at the end of it.
 *
 * The rows inside it are their own targets and sit on top of this one, so this
 * only ever catches the space below them — which is exactly what "put it at the
 * bottom of this column" should mean, and the only way to fill a column that
 * has nothing in it yet.
 */
function DroppableColumn({ id, children, label }: { id: string; children: React.ReactNode; label: string }) {
  const { setNodeRef, dropProps, isOver } = useDropTarget({ id, mode: "into" });
  return (
    <div className="space-y-2">
      <p className="ds-kicker mb-2">{label}</p>
      <div
        ref={setNodeRef}
        {...dropProps}
        className={`space-y-2 min-h-[80px] rounded-md border-2 border-dashed p-2 transition-colors ${
          isOver ? "border-rule bg-accent" : "border-border"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

const Index = () => {
  const { data: user } = useCurrentUser();
  const { activeDeanery } = useDeanery();
  const [isEditing, setIsEditing] = useState(false);
  const [settingsWidget, setSettingsWidget] = useState<WidgetId | null>(null);
  const { layout, hiddenWidgets, columns, rightColumnWidgets, widgetSettings, savePrefs } = useDashboardPreferences();

  // The greeting's name comes off the shared profile read rather than a
  // fourth SELECT of the same row.
  const { data: profile, isPending: profilePending } = useProfile();

  const { data: announcements } = useQuery({
    queryKey: ["active-announcements", activeDeanery?.id],
    queryFn: async () => {
      let query = supabase
        .from("announcements").select("*").eq("is_active", true)
        .order("created_at", { ascending: false }).limit(3);
      if (activeDeanery) query = query.eq("deanery_id", activeDeanery.id);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // No stand-in name while the profile is in flight. Greeting somebody as
  // "Trainee" for a second and then correcting it to their own name reads as
  // the page not knowing who they are; "Welcome back" on its own is true the
  // whole time, and the name is added when it is known.
  const firstName = profile?.first_name?.trim() || (profilePending ? null : "Trainee");

  // Compute visible widgets (excluding announcements and hidden)
  const allVisible = layout.filter((w) => !hiddenWidgets.includes(w) && w !== "announcements");

  // Split into left/right columns
  const leftColumn = allVisible.filter((w) => !rightColumnWidgets.includes(w));
  const rightColumn = allVisible.filter((w) => rightColumnWidgets.includes(w));

  // For single-column or non-editing mode with 1 col, use flat list
  const visibleWidgets = allVisible;

  /**
   * Where a widget goes when it is let go.
   *
   * The drop names a gap — a column and a position in it — and the layout
   * maths in `planWidgetDrop` turns that into the two lists the dashboard
   * stores. Nothing here works out an order of its own, which is what keeps
   * the line you were shown and the arrangement you get the same thing.
   */
  const twoColumn = columns === 2 && isEditing;

  const dropWidget = ({ source, over }: DropEvent) => {
    if (!over) return;
    const moving = source.ids.filter((w): w is WidgetId => allVisible.includes(w as WidgetId));
    if (!moving.length) return;

    const onColumn = over.id === "col-left" || over.id === "col-right";
    const column: "left" | "right" = onColumn
      ? (over.id === "col-right" ? "right" : "left")
      : ((over.data.column as "left" | "right" | undefined) ?? "left");
    // A drop on the column itself has no row to measure against: it means the
    // end of that column.
    const slot = onColumn
      ? Number.MAX_SAFE_INTEGER
      : slotForEdge(over.index ?? 0, over.edge === "into" ? "before" : over.edge);

    saveLayout(planWidgetDrop({
      layout,
      hidden: [...hiddenWidgets, "announcements" as WidgetId],
      right: rightColumnWidgets,
      moving,
      target: { column, slot },
      columns: twoColumn ? 2 : 1,
    }));
  };

  /**
   * Save, unless the drop changed nothing.
   *
   * Letting go of a widget where you picked it up is the commonest drop of
   * all — it is how you change your mind — and it should cost nothing.
   */
  const saveLayout = (write: ReturnType<typeof planWidgetDrop<WidgetId>>) => {
    const same =
      write.widget_layout.join() === layout.join() &&
      write.right_column_widgets.join() === rightColumnWidgets.join();
    if (same) return;
    savePrefs.mutate(write);
  };

  /** The same move, one step at a time, from the arrow keys on a handle. */
  const moveWidgetBy = (id: string, direction: -1 | 1) => {
    const widget = id as WidgetId;
    const inRight = twoColumn && rightColumnWidgets.includes(widget);
    const column = twoColumn ? (inRight ? rightColumn : leftColumn) : visibleWidgets;
    const from = column.indexOf(widget);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= column.length) return;

    saveLayout(planWidgetDrop({
      layout,
      hidden: [...hiddenWidgets, "announcements" as WidgetId],
      right: rightColumnWidgets,
      moving: [widget],
      target: {
        column: inRight ? "right" : "left",
        slot: direction === 1 ? to + 1 : to,
      },
      columns: twoColumn ? 2 : 1,
    }));
  };

  const toggleWidget = (widgetId: WidgetId) => {
    const newHidden = hiddenWidgets.includes(widgetId)
      ? hiddenWidgets.filter((w) => w !== widgetId)
      : [...hiddenWidgets, widgetId];
    savePrefs.mutate({ hidden_widgets: newHidden });
  };

  const renderWidget = (widgetId: WidgetId) => {
    switch (widgetId) {
      case "specialties":
        return <SpecialtiesWidget />;
      case "registers":
        return <RegistersWidget />;
      case "bookmarks":
        return <BookmarksWidget />;
      case "recent_resources":
        return <RecentResourcesWidget />;
      case "watched_discussions":
        return <WatchedDiscussionsWidget />;
      case "contacts":
        return <StarredContactsWidget />;
      case "file_browser":
        return (
          <FileBrowserWidget
            settings={widgetSettings.file_browser}
            onOpenSettings={() => setSettingsWidget("file_browser")}
          />
        );
      default:
        return null;
    }
  };

  const moveToOtherColumn = (widgetId: WidgetId) => {
    const inRight = rightColumnWidgets.includes(widgetId);
    const newRight = inRight
      ? rightColumnWidgets.filter((w) => w !== widgetId)
      : [...rightColumnWidgets, widgetId];
    savePrefs.mutate({ right_column_widgets: newRight });
  };

  const renderEditCard = (widgetId: WidgetId, index: number, column: "left" | "right") => (
    <SortableWidget
      key={widgetId}
      id={widgetId}
      label={WIDGET_LABELS[widgetId]}
      isEditing
      index={index}
      column={column}
    >
      <Card className="border border-dashed border-border">
        <CardContent className="flex items-center justify-between p-3">
          <span className="text-sm font-medium">{WIDGET_LABELS[widgetId]}</span>
          <div className="flex items-center gap-1.5">
            {widgetId === "file_browser" && (
              <button
                onClick={() => setSettingsWidget("file_browser")}
                className="flex h-5 w-5 items-center justify-center bg-muted text-muted-foreground transition-colors hover:bg-accent-strong hover:text-accent-foreground"
                title="Choose default folder"
              >
                <Cog className="h-3 w-3" />
              </button>
            )}
            {columns === 2 && (
              <button
                onClick={() => moveToOtherColumn(widgetId)}
                className="flex h-5 w-5 items-center justify-center bg-muted text-muted-foreground transition-colors hover:bg-accent-strong hover:text-accent-foreground"
                title={rightColumnWidgets.includes(widgetId) ? "Move to left column" : "Move to right column"}
              >
                <ArrowLeftRight className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={() => toggleWidget(widgetId)}
              className="flex h-5 w-5 items-center justify-center bg-destructive text-destructive-foreground transition-colors hover:bg-destructive-hover"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </CardContent>
      </Card>
    </SortableWidget>
  );

  const renderViewCard = (widgetId: WidgetId) => {
    const content = renderWidget(widgetId);
    if (!content) return null;
    return (
      <SortableWidget key={widgetId} id={widgetId} isEditing={false}>
        {content}
      </SortableWidget>
    );
  };

  const renderTwoColumnEditing = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <DroppableColumn id="col-left" label="Left Column">
        {leftColumn.length === 0 && (
          <p className="py-4 text-xs text-muted-foreground">Drag widgets here</p>
        )}
        {leftColumn.map((wId, index) => renderEditCard(wId, index, "left"))}
      </DroppableColumn>
      <DroppableColumn id="col-right" label="Right Column">
        {rightColumn.length === 0 && (
          <p className="py-4 text-xs text-muted-foreground">Drag widgets here</p>
        )}
        {rightColumn.map((wId, index) => renderEditCard(wId, index, "right"))}
      </DroppableColumn>
    </div>
  );

  const renderTwoColumnView = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        {leftColumn.map((wId) => renderViewCard(wId))}
      </div>
      <div className="space-y-6">
        {rightColumn.map((wId) => renderViewCard(wId))}
      </div>
    </div>
  );

  const renderSingleColumn = () => (
    <div className={isEditing ? "space-y-2" : "space-y-6"}>
      {visibleWidgets.map((wId, index) =>
        isEditing ? renderEditCard(wId, index, "left") : renderViewCard(wId))}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        {/* The poster. 1B opens the dashboard on a full-bleed accent field
            with the line set as large as the column will carry, and that
            field is the one place the design runs the accent at full
            strength. The greeting is the app's own — the design's line is
            marketing copy for a product page, and this is somebody's
            dashboard — but it is set at the poster's scale. */}
        <div className="flex flex-wrap items-end justify-between gap-8 bg-primary px-9 py-11 text-primary-foreground">
          <div className="min-w-0 max-w-3xl">
            <p className="text-[12px] font-bold uppercase tracking-[0.16em]">
              {activeDeanery?.name ?? ""} HST Training Hub
            </p>
            <h1 className="mt-3 font-display text-[clamp(34px,5.2vw,62px)] font-extrabold leading-[0.95] tracking-[-0.035em]">
              Welcome back{firstName ? `, ${firstName}` : ""}
            </h1>
          </div>
          {/* Outlined in the field's own foreground: an ordinary secondary
              button draws itself in the page's divider colour, which on red
              is barely there. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
            className="shrink-0 gap-2 border-primary-foreground/70 text-primary-foreground hover:bg-primary-foreground/15 active:bg-primary-foreground/25"
          >
            <Settings2 className="h-4 w-4" />
            {isEditing ? "Done Editing" : "Customise Dashboard"}
          </Button>
        </div>

      {/* Pinned Announcements — always at top */}
      {announcements?.length ? (
        <div className="divide-y divide-background/20">
          {/* The notice runs in ink directly under the poster. Two accent
              fields stacked would be two posters and neither would lead;
              the design answers that by inverting the second one. */}
          {announcements.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-baseline gap-x-5 gap-y-1 bg-foreground px-9 py-4 text-background"
            >
              <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-[0.14em]">Notice</span>
              <p className="min-w-0 flex-1 basis-full text-sm sm:basis-auto">
                <span className="font-bold">{a.title}</span>
                {a.content ? <span className="opacity-90"> — {a.content}</span> : null}
              </p>
              <span className="shrink-0 text-[13px] opacity-60">
                {new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
            </div>
          ))}
        </div>
      ) : null}
        <div className="space-y-8 p-9">
        {/* Widget visibility toggles when editing */}
        {isEditing && (
          <Card className="animate-fade-in border-l-2 border-rule bg-accent">
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  Toggle widgets on or off, and drag a handle to reorder
                  {columns === 2 ? " between columns" : ""}. On a touch screen,
                  press and hold the handle first; from the keyboard, tab to a
                  handle and use the arrow keys.
                </p>
                <div className="flex items-center gap-1 border border-border p-0.5">
                  <Button
                    variant={columns === 1 ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2 gap-1 text-xs"
                    onClick={() => savePrefs.mutate({ columns: 1 })}
                  >
                    <Rows3 className="h-3.5 w-3.5" /> 1 Column
                  </Button>
                  <Button
                    variant={columns === 2 ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2 gap-1 text-xs"
                    onClick={() => savePrefs.mutate({ columns: 2 })}
                  >
                    <Columns2 className="h-3.5 w-3.5" /> 2 Columns
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(WIDGET_LABELS) as WidgetId[]).filter((w) => w !== "announcements").map((wId) => {
                  const isHidden = hiddenWidgets.includes(wId);
                  return (
                    <Button
                      key={wId}
                      variant={isHidden ? "outline" : "secondary"}
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => toggleWidget(wId)}
                    >
                      {isHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {WIDGET_LABELS[wId]}
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}


        {/* Sortable widgets */}
        <DragProvider
          axis="vertical"
          onDrop={dropWidget}
          onKeyboardMove={moveWidgetBy}
          renderPreview={(source) => (
            <Card className="border-l-2 border-rule bg-card">
              <CardContent className="flex items-center justify-between p-3">
                <span className="text-sm font-medium">{WIDGET_LABELS[source.id as WidgetId]}</span>
              </CardContent>
            </Card>
          )}
        >
          {columns === 2
            ? (isEditing ? renderTwoColumnEditing() : renderTwoColumnView())
            : renderSingleColumn()}
        </DragProvider>

        <FileBrowserWidgetSettings
          open={settingsWidget === "file_browser"}
          onOpenChange={(o) => setSettingsWidget(o ? "file_browser" : null)}
          value={widgetSettings.file_browser}
          onSave={(v) => savePrefs.mutate({ widget_settings: { ...widgetSettings, file_browser: v } })}
        />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Index;
