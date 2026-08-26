import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ContactCard } from "@/components/ContactCard";
import { contactCategories } from "@/lib/contacts";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const KeyContacts = () => {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { data: contacts = [] } = useQuery({
    queryKey: ["all-contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("archived", false)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = contacts.filter((c) => {
    const matchesSearch =
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.role.toLowerCase().includes(search.toLowerCase()) ||
      c.organisation.toLowerCase().includes(search.toLowerCase());
    const matchesCat = !activeCategory || c.category === activeCategory;
    return matchesSearch && matchesCat;
  });

  // Group by category
  const grouped = contactCategories
    .map((cat) => ({
      ...cat,
      contacts: filtered.filter((c) => c.category === cat.key),
    }))
    .filter((g) => g.contacts.length > 0);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-display font-bold mb-1">Key Contacts</h1>
          <p className="text-sm text-muted-foreground">
            Directory of training leads, supervisors, and programme contacts across all specialties.
          </p>
        </div>

        {/* Search & filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge
            variant={activeCategory === null ? "default" : "secondary"}
            className="cursor-pointer text-xs"
            onClick={() => setActiveCategory(null)}
          >
            All
          </Badge>
          {contactCategories.map((cat) => (
            <Badge
              key={cat.key}
              variant={activeCategory === cat.key ? "default" : "secondary"}
              className="cursor-pointer text-xs"
              onClick={() => setActiveCategory(activeCategory === cat.key ? null : cat.key)}
            >
              {cat.label}
            </Badge>
          ))}
        </div>

        {/* Grouped contacts */}
        {grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">No contacts found.</p>
        ) : (
          grouped.map((group) => (
            <div key={group.key} className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <group.icon className="h-4 w-4" />
                {group.label}
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {group.contacts.map((contact) => (
                  <ContactCard key={contact.id} contact={contact} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </DashboardLayout>
  );
};

export default KeyContacts;
