import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, FolderSearch, Loader2 } from "lucide-react";

import { DashboardLayout } from "@/components/DashboardLayout";
import { Highlight } from "@/components/InlineSearch";
import { getIcon } from "@/lib/iconMap";
import { KIND_ICONS } from "@/lib/searchIcons";
import {
  KIND_LABELS, KIND_ORDER, type SearchHit, useGlobalSearch,
} from "@/hooks/useGlobalSearch";

/**
 * Every match for a search, on a page of its own.
 *
 * Pressing Enter in the header's box without picking a result lands here. The
 * dropdown only has room for a handful of each kind, and Enter used to open
 * the first of them — a guess on the reader's behalf. This lists the lot,
 * grouped the same way, and gives anything that lives in the drive two ways
 * in: open it straight away, or go to where it sits with it picked out.
 */
const SearchResults = () => {
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const { query, hits, isFetching } = useGlobalSearch(q, { full: true });

  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    items: hits.filter((h) => h.kind === kind),
  })).filter((g) => g.items.length > 0);

  // Until the debounced term catches up with the URL, what is on screen
  // belongs to the previous search.
  const settled = query === q && !isFetching;

  return (
    <DashboardLayout breadcrumb="Search">
      <div className="animate-fade-in space-y-6 p-9">
        <div>
          <h1 className="mb-1 font-display text-2xl font-bold">
            {q ? <>Results for “{q}”</> : "Search"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {!q
              ? "Type in the search box above and press Enter to see every match."
              : !settled
                ? "Searching…"
                : `${hits.length} result${hits.length === 1 ? "" : "s"}`}
          </p>
        </div>

        {q && !settled && !hits.length && (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Searching" />
        )}

        {q && settled && !hits.length && (
          <p className="py-12 text-center text-sm text-muted-foreground">Nothing matches “{q}”.</p>
        )}

        {grouped.map((group) => (
          <section key={group.kind} className="space-y-2">
            <h2 className="ds-kicker border-b-2 border-border pb-2">
              {KIND_LABELS[group.kind]} <span className="text-muted-foreground">· {group.items.length}</span>
            </h2>
            <ul>
              {group.items.map((hit) => (
                <ResultRow key={hit.key} hit={hit} query={query} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </DashboardLayout>
  );
};

function ResultRow({ hit, query }: { hit: SearchHit; query: string }) {
  const Icon = hit.kind === "specialty" ? getIcon(hit.iconName) : KIND_ICONS[hit.kind];
  const openPath = hit.openPath ?? hit.path;

  return (
    <li className="group flex items-center gap-3 border-b border-border py-2.5 pl-1 hover:bg-accent">
      <Icon
        className="h-4 w-4 shrink-0 text-muted-foreground"
        style={hit.color ? { color: `hsl(${hit.color})` } : undefined}
        aria-hidden
      />
      <Link to={openPath} className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold group-hover:underline">
          <Highlight text={hit.label} query={query} />
        </span>
        {hit.sublabel && (
          <span className="block truncate text-[13px] text-muted-foreground">
            <Highlight text={hit.sublabel} query={query} />
          </span>
        )}
      </Link>
      <div className="flex shrink-0 items-center gap-1 pr-1">
        {hit.locatePath && (
          <Link
            to={hit.locatePath}
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            title="Go to where it is, with it highlighted"
          >
            <FolderSearch className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Show location</span>
          </Link>
        )}
        <Link
          to={openPath}
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Open</span>
        </Link>
      </div>
    </li>
  );
}

export default SearchResults;
