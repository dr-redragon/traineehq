import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Clock, Megaphone, FileText, Video, LinkIcon, BookOpen, CheckSquare,
  FolderOpen, ChevronRight, Settings2, Eye, EyeOff, X, Columns2, Rows3,
  ArrowLeftRight, Cog,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getIcon } from "@/lib/iconMap";
import { useCurrentUser } from "@/hooks/useUserRole";
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
import {
  DndContext, closestCenter,
  type DragEndEvent, DragOverlay, type DragStartEvent, type DragOverEvent,
  useDroppable,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { SortableWidget } from "@/components/dashboard/SortableWidget";
import { useDragSensors } from "@/hooks/useDragSensors";

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

function DroppableColumn({ id, children, label }: { id: string; children: React.ReactNode; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div className="space-y-2">
      <p className="ds-kicker mb-2">{label}</p>
      <div
        ref={setNodeRef}
        className={`space-y-2 min-h-[80px] rounded-md border-2 border-dashed p-2 transition-colors ${
          isOver ? "border-rule bg-accent-100" : "border-border"
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
  const [activeId, setActiveId] = useState<WidgetId | null>(null);
  const [settingsWidget, setSettingsWidget] = useState<WidgetId | null>(null);
  const { layout, hiddenWidgets, columns, rightColumnWidgets, widgetSettings, savePrefs } = useDashboardPreferences();

  const sensors = useDragSensors();

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("first_name").eq("user_id", user.id).single();
      return data;
    },
    enabled: !!user,
  });

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

  const firstName = profile?.first_name || "Trainee";

  // Compute visible widgets (excluding announcements and hidden)
  const allVisible = layout.filter((w) => !hiddenWidgets.includes(w) && w !== "announcements");

  // Split into left/right columns
  const leftColumn = allVisible.filter((w) => !rightColumnWidgets.includes(w));
  const rightColumn = allVisible.filter((w) => rightColumnWidgets.includes(w));

  // For single-column or non-editing mode with 1 col, use flat list
  const visibleWidgets = allVisible;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as WidgetId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeWidget = active.id as WidgetId;
    const overId = over.id as string;

    if (columns === 2 && isEditing) {
      const activeInRight = rightColumnWidgets.includes(activeWidget);

      // Dropped on a column container (not on a widget)
      if (overId === "col-left" || overId === "col-right") {
        const targetIsRight = overId === "col-right";
        if (activeInRight === targetIsRight) return; // already there
        const newRight = targetIsRight
          ? [...rightColumnWidgets, activeWidget]
          : rightColumnWidgets.filter((w) => w !== activeWidget);
        savePrefs.mutate({ right_column_widgets: newRight });
        return;
      }

      // Dropped on another widget
      const overWidget = overId as WidgetId;
      if (activeWidget === overWidget) return;

      const overInRight = rightColumnWidgets.includes(overWidget);

      if (activeInRight === overInRight) {
        // Same column reorder
        const col = activeInRight ? [...rightColumn] : [...leftColumn];
        const oldIdx = col.indexOf(activeWidget);
        const newIdx = col.indexOf(overWidget);
        const reordered = arrayMove(col, oldIdx, newIdx);
        const newLayout = activeInRight
          ? [...leftColumn, ...reordered, ...hiddenWidgets]
          : [...reordered, ...rightColumn, ...hiddenWidgets];
        savePrefs.mutate({ widget_layout: newLayout });
      } else {
        // Cross-column move
        const newRight = activeInRight
          ? rightColumnWidgets.filter((w) => w !== activeWidget)
          : [...rightColumnWidgets, activeWidget];

        const targetCol = overInRight
          ? allVisible.filter((w) => newRight.includes(w))
          : allVisible.filter((w) => !newRight.includes(w));
        const overIdx = targetCol.indexOf(overWidget);
        const withoutActive = targetCol.filter((w) => w !== activeWidget);
        withoutActive.splice(overIdx >= 0 ? overIdx : withoutActive.length, 0, activeWidget);

        const otherCol = overInRight
          ? allVisible.filter((w) => !newRight.includes(w) && w !== activeWidget)
          : allVisible.filter((w) => newRight.includes(w) && w !== activeWidget);

        const newLayout = [...(overInRight ? otherCol : withoutActive), ...(overInRight ? withoutActive : otherCol), ...hiddenWidgets];
        savePrefs.mutate({ widget_layout: newLayout, right_column_widgets: newRight });
      }
    } else {
      // Single column reorder
      if (activeWidget === overId) return;
      const oldIndex = visibleWidgets.indexOf(activeWidget);
      const newIndex = visibleWidgets.indexOf(overId as WidgetId);
      if (oldIndex === -1 || newIndex === -1) return;
      const newOrder = arrayMove(visibleWidgets, oldIndex, newIndex);
      const fullLayout = [...newOrder, ...hiddenWidgets];
      savePrefs.mutate({ widget_layout: fullLayout });
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    // Used for visual feedback — actual move happens on dragEnd
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

  const renderEditCard = (widgetId: WidgetId) => (
    <SortableWidget key={widgetId} id={widgetId} label={WIDGET_LABELS[widgetId]} isEditing>
      <Card className="border border-dashed border-border">
        <CardContent className="flex items-center justify-between p-3">
          <span className="text-sm font-medium">{WIDGET_LABELS[widgetId]}</span>
          <div className="flex items-center gap-1.5">
            {widgetId === "file_browser" && (
              <button
                onClick={() => setSettingsWidget("file_browser")}
                className="flex h-5 w-5 items-center justify-center bg-muted text-muted-foreground transition-colors hover:bg-accent-200 hover:text-accent-800"
                title="Choose default folder"
              >
                <Cog className="h-3 w-3" />
              </button>
            )}
            {columns === 2 && (
              <button
                onClick={() => moveToOtherColumn(widgetId)}
                className="flex h-5 w-5 items-center justify-center bg-muted text-muted-foreground transition-colors hover:bg-accent-200 hover:text-accent-800"
                title={rightColumnWidgets.includes(widgetId) ? "Move to left column" : "Move to right column"}
              >
                <ArrowLeftRight className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={() => toggleWidget(widgetId)}
              className="flex h-5 w-5 items-center justify-center bg-destructive text-destructive-foreground transition-colors hover:bg-accent-900"
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
        {leftColumn.map((wId) => renderEditCard(wId))}
      </DroppableColumn>
      <DroppableColumn id="col-right" label="Right Column">
        {rightColumn.length === 0 && (
          <p className="py-4 text-xs text-muted-foreground">Drag widgets here</p>
        )}
        {rightColumn.map((wId) => renderEditCard(wId))}
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
      {visibleWidgets.map((wId) => isEditing ? renderEditCard(wId) : renderViewCard(wId))}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-8">
        {/* The page opens the way the design system opens one: a kicker, a
            display-grade line set flush left, and a 2px rule closing the head
            off from the sections below it. */}
        <div className="animate-fade-in border-b-2 border-border pb-4">
          <p className="ds-kicker mb-2">Dashboard</p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-[42px] font-extrabold leading-[1.05] tracking-tight">
                Welcome back, {firstName}
              </h1>
              <p className="mt-1 text-muted-foreground">Access your training resources and stay up to date.</p>
            </div>
            <Button
              variant={isEditing ? "default" : "outline"}
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
              className="shrink-0 gap-2"
            >
              <Settings2 className="h-4 w-4" />
              {isEditing ? "Done Editing" : "Customise Dashboard"}
            </Button>
          </div>
        </div>

        {/* Widget visibility toggles when editing */}
        {isEditing && (
          <Card className="animate-fade-in border-l-2 border-rule bg-accent-100">
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  Toggle widgets on or off, and drag a handle to reorder
                  {columns === 2 ? " between columns" : ""}. On a touch screen,
                  press and hold the handle first.
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

        {/* Pinned Announcements — always at top */}
        {announcements?.length ? (
          <div className="space-y-3">
            {/* The poster statement. The design system runs the accent as a
                field in exactly one place — the thing on the page that has to
                carry it — and on a dashboard that is the announcement. The
                field is accent-600 rather than the base accent so the white
                copy on it clears AA; at a glance the two are the same red. */}
            {announcements.map((a) => (
              <div key={a.id} className="flex items-start gap-4 bg-primary p-5 text-primary-foreground">
                <Megaphone className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <div className="min-w-0">
                  <h3 className="font-display text-lg font-extrabold leading-tight tracking-tight">{a.title}</h3>
                  <p className="mt-1 text-sm">{a.content}</p>
                  <p className="mt-2 text-[10px] uppercase tracking-[0.1em] opacity-80">
                    {new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Sortable widgets */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
        >
          <SortableContext items={visibleWidgets} strategy={verticalListSortingStrategy}>
            {columns === 2
              ? (isEditing ? renderTwoColumnEditing() : renderTwoColumnView())
              : renderSingleColumn()
            }
          </SortableContext>
          <DragOverlay>
            {activeId && isEditing ? (
              <Card className="border-l-2 border-rule shadow-lg">
                <CardContent className="flex items-center justify-between p-3">
                  <span className="text-sm font-medium">{WIDGET_LABELS[activeId]}</span>
                </CardContent>
              </Card>
            ) : null}
          </DragOverlay>
        </DndContext>

        <FileBrowserWidgetSettings
          open={settingsWidget === "file_browser"}
          onOpenChange={(o) => setSettingsWidget(o ? "file_browser" : null)}
          value={widgetSettings.file_browser}
          onSave={(v) => savePrefs.mutate({ widget_settings: { ...widgetSettings, file_browser: v } })}
        />
      </div>
    </DashboardLayout>
  );
};

export default Index;
