import { Component, Suspense, type ReactNode } from "react";

/** The same quiet full-page line RequireAuth uses while it checks the session. */
function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="text-center text-sm text-muted-foreground">Loading…</div>
    </div>
  );
}

/**
 * Recovers from a chunk that is no longer on the server.
 *
 * Splitting the routes means a page is fetched when it is opened, and the
 * files are named by content hash. GitHub Pages replaces the whole site on
 * each deploy, so a tab left open across a deploy is holding an index that
 * names chunks which have just been deleted: the next navigation fails on a
 * 404 that React surfaces as a render error, and the page goes blank.
 *
 * Reloading picks up the new index and the new names. Once only, recorded in
 * sessionStorage, so a genuinely broken build cannot put the tab in a reload
 * loop — the second failure shows the message instead.
 */
const RELOAD_FLAG = "traineehq.chunk-reloaded";

class ChunkErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // Vite's own wording, plus the browsers' two. Anything else is a real
    // error in the page and must not be answered with a reload.
    const isChunkError = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i
      .test(message);
    let alreadyTried = true;
    try {
      alreadyTried = sessionStorage.getItem(RELOAD_FLAG) === "1";
      if (!alreadyTried) sessionStorage.setItem(RELOAD_FLAG, "1");
    } catch {
      // No storage: do not reload, because there is nothing to stop a loop.
    }
    if (isChunkError && !alreadyTried) window.location.reload();
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="max-w-sm space-y-2 text-center">
            <p className="text-sm font-semibold">This page could not be loaded</p>
            <p className="text-sm text-muted-foreground">
              The site may have been updated while this tab was open. Reloading usually fixes it.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Wraps the routed pages, which are loaded on demand.
 *
 * Every page used to be in one bundle: opening the sign-in screen downloaded
 * and parsed the admin panel, both teaching registers, the file browser and
 * the PDF and zip libraries the certificates need — 1.4MB of JavaScript before
 * anything could be drawn. Split per route, a page costs what that page costs.
 */
export function RouteChunk({ children }: { children: ReactNode }) {
  return (
    <ChunkErrorBoundary>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </ChunkErrorBoundary>
  );
}
