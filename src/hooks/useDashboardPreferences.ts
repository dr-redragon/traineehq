import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useUserRole";

export type WidgetId =
  | "announcements"
  | "specialties"
  | "bookmarks"
  | "recent_resources"
  | "watched_discussions"
  | "contacts"
  | "file_browser";

export interface WidgetSettings {
  file_browser?: {
    specialtyId?: string | null;
    subsectionId?: string | null;
    folderId?: string | null;
  };
}

const DEFAULT_LAYOUT: WidgetId[] = [
  "announcements",
  "specialties",
  "file_browser",
  "bookmarks",
  "recent_resources",
  "watched_discussions",
  "contacts",
];

export function useDashboardPreferences() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["dashboard-preferences", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("dashboard_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const storedLayout = (prefs?.widget_layout as WidgetId[] | null) ?? null;
  // Ensure newly added widgets appear for users with an existing saved layout
  const layout: WidgetId[] = storedLayout
    ? [...storedLayout, ...DEFAULT_LAYOUT.filter((w) => !storedLayout.includes(w))]
    : DEFAULT_LAYOUT;
  const hiddenWidgets: WidgetId[] = (prefs?.hidden_widgets as WidgetId[] | null) ?? [];
  const columns: 1 | 2 = ((prefs as any)?.columns === 2 ? 2 : 1);
  const rightColumnWidgets: WidgetId[] = ((prefs as any)?.right_column_widgets as WidgetId[] | null) ?? [];
  const widgetSettings: WidgetSettings = ((prefs as any)?.widget_settings as WidgetSettings | null) ?? {};

  const savePrefs = useMutation({
    mutationFn: async (update: {
      widget_layout?: WidgetId[];
      hidden_widgets?: WidgetId[];
      columns?: 1 | 2;
      right_column_widgets?: WidgetId[];
      widget_settings?: WidgetSettings;
    }) => {
      if (!user) return;
      const payload = {
        user_id: user.id,
        widget_layout: update.widget_layout ?? layout,
        hidden_widgets: update.hidden_widgets ?? hiddenWidgets,
        columns: update.columns ?? columns,
        right_column_widgets: update.right_column_widgets ?? rightColumnWidgets,
        widget_settings: (update.widget_settings ?? widgetSettings) as any,
      };
      const { error } = await supabase
        .from("dashboard_preferences")
        .upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard-preferences"] }),
  });

  return { layout, hiddenWidgets, columns, rightColumnWidgets, widgetSettings, isLoading, savePrefs };
}
