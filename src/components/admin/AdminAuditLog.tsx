import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollText, ShieldCheck, UserCog, KeyRound } from "lucide-react";

/** How many entries to show. The log is append-only and will outgrow one page. */
const PAGE_SIZE = 200;

interface AuditRow {
  id: string;
  user_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

type Filter = "all" | "roles" | "registers" | "requests";

const FILTERS: { value: Filter; label: string; matches: (a: string) => boolean }[] = [
  { value: "all", label: "Everything", matches: () => true },
  { value: "roles", label: "Roles", matches: (a) => a.startsWith("role.") },
  { value: "registers", label: "Register access", matches: (a) => a.startsWith("register.") },
  { value: "requests", label: "Access requests", matches: (a) => a.includes("access_request") },
];

const ICONS: Record<string, typeof ShieldCheck> = {
  "role.granted": ShieldCheck,
  "role.revoked": ShieldCheck,
  "role.changed": ShieldCheck,
  "register.member_added": UserCog,
  "register.member_removed": UserCog,
  "register.member_role_changed": UserCog,
  "access_request.decided": KeyRound,
  "register.access_decided": KeyRound,
};

function timeOf(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function AdminAuditLog() {
  const [filter, setFilter] = useState<Filter>("all");

  const { data: entries, isLoading } = useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, user_id, action, details, created_at")
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE)
        .returns<AuditRow[]>();
      if (error) throw error;
      return data;
    },
  });

  // Names are looked up separately: the log stores ids, so that personal data
  // is not copied into a second place in order to satisfy data protection.
  const { data: names } = useQuery({
    queryKey: ["profile-display-names"],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_profile_display_names")
        .returns<{ user_id: string; first_name: string | null; last_name: string | null }[]>();
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: registers } = useQuery({
    queryKey: ["register-names"],
    queryFn: async () => {
      const { data } = await supabase
        .from("registers").select("id, name")
        .returns<{ id: string; name: string }[]>();
      return data ?? [];
    },
  });

  const nameOf = useMemo(() => {
    const map = new Map((names ?? []).map((n) => [
      n.user_id, [n.first_name, n.last_name].filter(Boolean).join(" ") || "Unnamed account",
    ]));
    return (id: unknown) => {
      if (typeof id !== "string") return null;
      // An id with no profile is a deleted account — worth saying so rather than
      // showing a bare uuid, since the entry outlives the person by design.
      return map.get(id) ?? "A deleted account";
    };
  }, [names]);

  const registerOf = useMemo(() => {
    const map = new Map((registers ?? []).map((r) => [r.id, r.name]));
    return (id: unknown) => (typeof id === "string" ? map.get(id) ?? "a register" : "a register");
  }, [registers]);

  /** One plain sentence per entry, rather than making admins read raw JSON. */
  function describe(row: AuditRow): string {
    const d = row.details ?? {};
    const who = nameOf(d.subject_user_id);
    switch (row.action) {
      case "role.granted":
        return `Gave ${who} the ${d.role} role`;
      case "role.revoked":
        return `Took the ${d.role} role away from ${who}`;
      case "role.changed":
        return `Changed ${who} from ${d.from} to ${d.to}`;
      case "register.member_added":
        return `Added ${who} to ${registerOf(d.register_id)} as ${d.role}`;
      case "register.member_removed":
        return `Removed ${who} from ${registerOf(d.register_id)}`;
      case "register.member_role_changed":
        return `Changed ${who} in ${registerOf(d.register_id)} from ${d.from} to ${d.to}`;
      case "access_request.decided":
        return `An access request was ${d.status}`;
      case "register.access_decided":
        return `${who}'s request for ${registerOf(d.register_id)} was ${d.status}`;
      default:
        return row.action;
    }
  }

  const shown = useMemo(() => {
    const test = FILTERS.find((f) => f.value === filter)?.matches ?? (() => true);
    return (entries ?? []).filter((e) => test(e.action));
  }, [entries, filter]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading the audit log…</p>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          <p className="flex items-start gap-2">
            <ScrollText className="h-4 w-4 mt-0.5 shrink-0 text-accent" />
            <span>
              Every change to who can see whose data: role grants, register membership,
              and decisions on access requests. Entries are written by the database
              itself, not by the app, so they are recorded whether or not the change
              was made through this panel — and nobody, including an admin, can edit
              or delete one.
            </span>
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? "default" : "outline"}
            size="sm"
            className="text-xs h-7"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {!shown.length ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          {entries?.length
            ? "Nothing of that kind has been recorded yet."
            : "Nothing recorded yet. The first role grant or register invitation will appear here."}
        </p>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {shown.map((row) => {
              const Icon = ICONS[row.action] ?? ScrollText;
              const actor = nameOf(row.user_id);
              return (
                <div key={row.id} className="flex items-start gap-3 p-3">
                  <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{describe(row)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {/* No actor means the change came from a server-side path — a
                          migration or an edge function — rather than a person. */}
                      {actor ?? "Automatically"} · {timeOf(row.created_at)}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0 font-mono">
                    {row.action}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {entries?.length === PAGE_SIZE && (
        <p className="text-xs text-muted-foreground text-center">
          Showing the most recent {PAGE_SIZE} entries.
        </p>
      )}
    </div>
  );
}
