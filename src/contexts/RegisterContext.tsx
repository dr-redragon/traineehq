import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRegisterDirectory } from "@/hooks/useRegisters";
import { useCurrentUser } from "@/hooks/useUserRole";
import type { RegisterDirectoryEntry } from "@/lib/register/types";

interface RegisterContextValue {
  /** The register being worked in, or null when the user belongs to none. */
  activeRegister: RegisterDirectoryEntry | null;
  /** Only the registers the user belongs to — what the switcher offers. */
  myRegisters: RegisterDirectoryEntry[];
  setActiveRegisterSlug: (slug: string) => void;
  isLoading: boolean;
}

const RegisterContext = createContext<RegisterContextValue>({
  activeRegister: null,
  myRegisters: [],
  setActiveRegisterSlug: () => {},
  isLoading: true,
});

export function useRegister() {
  return useContext(RegisterContext);
}

/**
 * Remembering the last register per account, not per browser.
 *
 * Keyed by user id so that signing out and back in as somebody else does not
 * drop them into a register they may not even belong to — the directory would
 * correct it on load, but only after a flash of the wrong register's name.
 */
const storageKey = (userId: string) => `traineehq.activeRegister.${userId}`;

function readStored(userId: string | undefined): string | null {
  if (!userId) return null;
  try {
    return localStorage.getItem(storageKey(userId));
  } catch {
    // Private windows and blocked site data both throw here. Losing the
    // remembered register is a small thing; failing to render is not.
    return null;
  }
}

export function RegisterProvider({ children }: { children: ReactNode }) {
  const { data: user } = useCurrentUser();
  const { data: directory, isLoading } = useRegisterDirectory();
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  const myRegisters = useMemo(
    () => (directory ?? []).filter((r) => r.i_am_member),
    [directory],
  );

  // Pick up the remembered register once the directory can confirm it is still
  // one of theirs; fall back to the first. Access can be revoked between visits,
  // so the stored slug is a preference, never an assertion of membership.
  useEffect(() => {
    if (!myRegisters.length) {
      setActiveSlug(null);
      return;
    }
    setActiveSlug((current) => {
      if (current && myRegisters.some((r) => r.slug === current)) return current;
      const remembered = readStored(user?.id);
      if (remembered && myRegisters.some((r) => r.slug === remembered)) return remembered;
      return myRegisters[0].slug;
    });
  }, [myRegisters, user?.id]);

  const setActiveRegisterSlug = (slug: string) => {
    setActiveSlug(slug);
    if (!user?.id) return;
    try {
      localStorage.setItem(storageKey(user.id), slug);
    } catch {
      // As above: a register that is not remembered next time is survivable.
    }
  };

  const activeRegister = myRegisters.find((r) => r.slug === activeSlug) ?? null;

  return (
    <RegisterContext.Provider
      value={{ activeRegister, myRegisters, setActiveRegisterSlug, isLoading }}
    >
      {children}
    </RegisterContext.Provider>
  );
}
