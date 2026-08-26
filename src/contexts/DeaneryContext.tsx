import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, useUserRole } from "@/hooks/useUserRole";

interface Deanery {
  id: string;
  name: string;
  short_name: string;
  slug: string;
  logo_url: string | null;
  color: string | null;
  is_active: boolean;
}

interface DeaneryContextValue {
  activeDeanery: Deanery | null;
  allDeaneries: Deanery[];
  setActiveDeaneryId: (id: string) => void;
  isLoading: boolean;
}

const DeaneryContext = createContext<DeaneryContextValue>({
  activeDeanery: null,
  allDeaneries: [],
  setActiveDeaneryId: () => {},
  isLoading: true,
});

export function useDeanery() {
  return useContext(DeaneryContext);
}

export function DeaneryProvider({ children }: { children: ReactNode }) {
  const { data: user } = useCurrentUser();
  const { data: role } = useUserRole();
  const [activeDeaneryId, setActiveDeaneryId] = useState<string | null>(null);

  // Fetch all deaneries
  const { data: deaneries, isLoading: deansLoading } = useQuery({
    queryKey: ["deaneries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deaneries")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Deanery[];
    },
  });

  // Fetch user's profile to get their deanery
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["user-deanery", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("deanery_id")
        .eq("user_id", user.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  // Set active deanery from profile on load
  useEffect(() => {
    if (profile?.deanery_id && !activeDeaneryId) {
      setActiveDeaneryId(profile.deanery_id);
    } else if (!activeDeaneryId && deaneries?.length) {
      // Default to first deanery if no profile deanery
      setActiveDeaneryId(deaneries[0].id);
    }
  }, [profile, deaneries, activeDeaneryId]);

  const activeDeanery = deaneries?.find((d) => d.id === activeDeaneryId) ?? deaneries?.[0] ?? null;

  return (
    <DeaneryContext.Provider
      value={{
        activeDeanery,
        allDeaneries: deaneries ?? [],
        setActiveDeaneryId,
        isLoading: deansLoading || (!!user && profileLoading),
      }}
    >
      {children}
    </DeaneryContext.Provider>
  );
}
