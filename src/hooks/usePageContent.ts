import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** What a page's text belongs to: a section, or a folder inside one. */
export type PageTarget = { kind: "section"; id: string } | { kind: "folder"; id: string };

/**
 * Writes for page text, subpages and the specialty's layout.
 *
 * The specialty page reads sections and folders under these query keys, so
 * invalidating the prefix redraws both layouts from the saved rows.
 */
export function usePageContent(specialtyId: string) {
  const queryClient = useQueryClient();
  const refreshSections = () => queryClient.invalidateQueries({ queryKey: ["subsections", specialtyId] });
  const refreshFolders = () => queryClient.invalidateQueries({ queryKey: ["resource-folders", specialtyId] });

  const saveText = useMutation({
    mutationFn: async ({ target, body }: { target: PageTarget; body: string }) => {
      const patch = { body: body.trim() ? body : null, body_updated_at: new Date().toISOString() };
      const { error } = target.kind === "section"
        ? await supabase.from("subsections").update(patch).eq("id", target.id)
        : await supabase.from("resource_folders").update(patch).eq("id", target.id);
      if (error) throw error;
    },
    onSuccess: (_, { target }) => {
      toast.success("Text saved");
      return target.kind === "section" ? refreshSections() : refreshFolders();
    },
    onError: (e: Error) => toast.error(e.message ?? "Could not save the text"),
  });

  const setIsPage = useMutation({
    mutationFn: async ({ folderId, isPage }: { folderId: string; isPage: boolean }) => {
      const { error } = await supabase.from("resource_folders").update({ is_page: isPage }).eq("id", folderId);
      if (error) throw error;
    },
    onSuccess: (_, { isPage }) => {
      toast.success(isPage ? "Listed as a subpage" : "Back among the files as a folder");
      return refreshFolders();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** A new subpage: a folder that is a page, under a section or another page. */
  const addSubpage = useMutation({
    mutationFn: async ({ subsectionId, parentFolderId, name, sortOrder }: {
      subsectionId: string; parentFolderId: string | null; name: string; sortOrder: number;
    }) => {
      const { data, error } = await supabase
        .from("resource_folders")
        .insert({ subsection_id: subsectionId, parent_folder_id: parentFolderId, name, is_page: true, sort_order: sortOrder })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      toast.success("Page added");
      return refreshFolders();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renameFolder = useMutation({
    mutationFn: async ({ folderId, name }: { folderId: string; name: string }) => {
      const { error } = await supabase.from("resource_folders").update({ name }).eq("id", folderId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Page renamed");
      return refreshFolders();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setLayout = useMutation({
    mutationFn: async (layout: "classic" | "pages") => {
      const { error } = await supabase.from("specialties").update({ page_layout: layout }).eq("id", specialtyId);
      if (error) throw error;
    },
    onSuccess: (_, layout) => {
      toast.success(layout === "pages" ? "Switched to the pages layout" : "Switched to the classic layout");
      return queryClient.invalidateQueries({ queryKey: ["specialty", specialtyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { saveText, setIsPage, addSubpage, renameFolder, setLayout };
}
