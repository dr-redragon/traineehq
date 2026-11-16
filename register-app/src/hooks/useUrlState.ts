import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export type UrlPatch = Record<string, string | null | undefined>;

/**
 * Page state that belongs in the address bar: which tab is open, which
 * academic year, which teaching day.
 *
 * Kept in the query string rather than component state so a refresh, the Back
 * button and a link pasted to a colleague all land where the person was.
 *
 * `patch` changes several keys in one navigation — switching tab and clearing
 * a sub-view must not leave a history entry for the half-way state. A null or
 * empty value removes the key. It replaces the current entry by default;
 * `push` is for moves worth a Back press of their own, like changing tab.
 */
export function useUrlState() {
  const [params, setParams] = useSearchParams();

  const patch = useCallback(
    (changes: UrlPatch, { push = false }: { push?: boolean } = {}) => {
      setParams((previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      }, { replace: !push });
    },
    [setParams],
  );

  return { params, patch };
}
