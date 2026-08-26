import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { FileText, Users, MessageSquare, BookOpen, Search } from "lucide-react";
import { getIcon } from "@/lib/iconMap";

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const debouncedQuery = useDebounce(query, 250);

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  const { data: specialties } = useQuery({
    queryKey: ["search-specialties", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) return [];
      const { data } = await supabase
        .from("specialties")
        .select("id, short_name, name, icon_name, color")
        .or(`short_name.ilike.%${debouncedQuery}%,name.ilike.%${debouncedQuery}%`)
        .limit(5);
      return data ?? [];
    },
    enabled: open && debouncedQuery.length > 0,
  });

  const { data: resources } = useQuery({
    queryKey: ["search-resources", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) return [];
      const { data } = await supabase
        .from("resources")
        .select("id, title, resource_type, subsection_id, subsections!inner(specialty_id, specialties!inner(short_name))")
        .ilike("title", `%${debouncedQuery}%`)
        .limit(8);
      return data ?? [];
    },
    enabled: open && debouncedQuery.length > 0,
  });

  const { data: contacts } = useQuery({
    queryKey: ["search-contacts", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) return [];
      const { data } = await supabase
        .from("contacts")
        .select("id, name, role, organisation, specialty_id")
        .eq("archived", false)
        .or(`name.ilike.%${debouncedQuery}%,role.ilike.%${debouncedQuery}%,organisation.ilike.%${debouncedQuery}%`)
        .limit(5);
      return data ?? [];
    },
    enabled: open && debouncedQuery.length > 0,
  });

  const { data: discussions } = useQuery({
    queryKey: ["search-discussions", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) return [];
      const { data } = await supabase
        .from("discussions")
        .select("id, title, specialty_id")
        .ilike("title", `%${debouncedQuery}%`)
        .limit(5);
      return data ?? [];
    },
    enabled: open && debouncedQuery.length > 0,
  });

  const go = useCallback((path: string) => {
    onOpenChange(false);
    navigate(path);
  }, [navigate, onOpenChange]);

  const hasResults = (specialties?.length || 0) + (resources?.length || 0) + (contacts?.length || 0) + (discussions?.length || 0) > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search resources, specialties, contacts, discussions…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {debouncedQuery.length > 0 && !hasResults && (
          <CommandEmpty>No results found.</CommandEmpty>
        )}

        {!debouncedQuery && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Start typing to search across the platform…
          </div>
        )}

        {(specialties?.length ?? 0) > 0 && (
          <CommandGroup heading="Specialties">
            {specialties!.map((s) => {
              const SIcon = getIcon(s.icon_name);
              return (
                <CommandItem
                  key={s.id}
                  value={`specialty-${s.short_name}`}
                  onSelect={() => go(`/specialty/${s.id}`)}
                  className="cursor-pointer"
                >
                  <SIcon className="h-4 w-4 mr-2 shrink-0" style={{ color: `hsl(${s.color})` }} />
                  <div>
                    <span className="font-medium"><HighlightMatch text={s.short_name} query={debouncedQuery} /></span>
                    {s.name !== s.short_name && (
                      <span className="text-muted-foreground ml-2 text-xs"><HighlightMatch text={s.name} query={debouncedQuery} /></span>
                    )}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {(resources?.length ?? 0) > 0 && (
          <CommandGroup heading="Resources">
            {resources!.map((r: any) => (
              <CommandItem
                key={r.id}
                value={`resource-${r.title}`}
                onSelect={() => go(`/specialty/${r.subsections.specialty_id}?subsection=${r.subsection_id}`)}
                className="cursor-pointer"
              >
                <FileText className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="font-medium"><HighlightMatch text={r.title} query={debouncedQuery} /></span>
                  <span className="text-xs text-muted-foreground">{r.subsections.specialties.short_name}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(contacts?.length ?? 0) > 0 && (
          <CommandGroup heading="Contacts">
            {contacts!.map((c) => (
              <CommandItem
                key={c.id}
                value={`contact-${c.name}`}
                onSelect={() => c.specialty_id ? go(`/specialty/${c.specialty_id}#contacts`) : undefined}
                className="cursor-pointer"
              >
                <Users className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="font-medium"><HighlightMatch text={c.name} query={debouncedQuery} /></span>
                  <span className="text-xs text-muted-foreground"><HighlightMatch text={c.role} query={debouncedQuery} /> · <HighlightMatch text={c.organisation} query={debouncedQuery} /></span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(discussions?.length ?? 0) > 0 && (
          <CommandGroup heading="Discussions">
            {discussions!.map((d) => (
              <CommandItem
                key={d.id}
                value={`discussion-${d.title}`}
                onSelect={() => go(`/specialty/${d.specialty_id}#discussion`)}
                className="cursor-pointer"
              >
                <MessageSquare className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
                <span className="font-medium"><HighlightMatch text={d.title} query={debouncedQuery} /></span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/20 text-foreground rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
