import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Loader2, MessageSquare, Search, Users, X } from "lucide-react";

import { getIcon } from "@/lib/iconMap";
import { cn } from "@/lib/utils";
import {
  KIND_LABELS, KIND_ORDER, type SearchHit, type SearchKind, useGlobalSearch,
} from "@/hooks/useGlobalSearch";

const KIND_ICONS: Record<Exclude<SearchKind, "specialty">, typeof FileText> = {
  resource: FileText,
  contact: Users,
  discussion: MessageSquare,
};

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-accent-strong px-0.5 text-foreground">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

/**
 * The header's search box.
 *
 * It used to be a button dressed up as a field: clicking it opened a command
 * dialog, and the thing you typed into was never the thing you clicked. This
 * is a real input — you type in the box, and matches appear under it as you
 * type, so a result can be clicked before you have finished the word and
 * without a dialog ever opening.
 *
 * The listbox is the combobox pattern: arrows move a highlight, Enter opens
 * whatever is highlighted, and Enter with nothing highlighted opens the first
 * match, because after typing a query the top hit is what Enter is for.
 * Escape gives the query back before it closes, so a mistyped search can be
 * corrected rather than lost.
 */
export function InlineSearch({ className }: { className?: string }) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const { query, hits, isFetching } = useGlobalSearch(term, { enabled: open });

  // A new set of results invalidates wherever the highlight was.
  useEffect(() => setActive(-1), [query]);

  // ⌘K used to open a dialog. Now it puts the cursor in the box, which is
  // where it was always trying to get to.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Clicking anywhere else puts the dropdown away.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const go = (hit: SearchHit) => {
    setOpen(false);
    setTerm("");
    inputRef.current?.blur();
    navigate(hit.path);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      // First press clears a query, second closes. Escaping out of a typo
      // should not also throw away the panel you were reading.
      if (term) setTerm("");
      else setOpen(false);
      return;
    }
    if (!hits.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? hits.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(hits[active >= 0 ? active : 0]);
    }
  };

  const showPanel = open && query.length > 0;
  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    items: hits.filter((h) => h.kind === kind),
  })).filter((g) => g.items.length > 0);

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <div className="flex h-9 items-center gap-2 border border-input bg-card px-3 focus-within:border-rule">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          value={term}
          onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search every file, folder and thread"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 && hits[active] ? `${listId}-${hits[active].key}` : undefined}
        />
        {isFetching && query.length > 0 && (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-label="Searching" />
        )}
        {term && !isFetching && (
          <button
            type="button"
            onClick={() => { setTerm(""); inputRef.current?.focus(); }}
            aria-label="Clear search"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 right-0 top-[calc(100%+2px)] z-50 max-h-[70vh] overflow-y-auto border-2 border-border bg-popover shadow-lg"
        >
          {!hits.length ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              {isFetching ? "Searching…" : <>Nothing matches “{query}”.</>}
            </p>
          ) : (
            grouped.map((group) => (
              <div key={group.kind}>
                <p className="ds-kicker border-b border-border px-3 py-2">{KIND_LABELS[group.kind]}</p>
                {group.items.map((hit) => {
                  const index = hits.indexOf(hit);
                  const Icon = hit.kind === "specialty" ? getIcon(hit.iconName) : KIND_ICONS[hit.kind];
                  return (
                    <button
                      key={hit.key}
                      id={`${listId}-${hit.key}`}
                      role="option"
                      aria-selected={index === active}
                      type="button"
                      onPointerEnter={() => setActive(index)}
                      onClick={() => go(hit)}
                      className={cn(
                        "flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors last:border-b-0",
                        index === active ? "bg-accent" : "hover:bg-accent",
                      )}
                    >
                      <Icon
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        style={hit.color ? { color: `hsl(${hit.color})` } : undefined}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          <Highlight text={hit.label} query={query} />
                        </span>
                        {hit.sublabel && (
                          <span className="block truncate text-xs text-muted-foreground">
                            <Highlight text={hit.sublabel} query={query} />
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
