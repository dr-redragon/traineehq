import type { useRegisterStore } from "@/hooks/classic/useRegisterStore";

/**
 * The register's blob, and the way to change it.
 *
 * Panels take this rather than a register id so that the whole tab set reads and
 * writes one cached copy: the blob is stored and saved whole, and two panels
 * holding two copies would each save over the other.
 */
export type ClassicStore = ReturnType<typeof useRegisterStore>;
