import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { pageHits, type FolderTextRow, type SectionPageRow } from "./useGlobalSearch";

const section = (id: string, name: string, body: string | null): SectionPageRow => ({
  id, name, body, specialty_id: "sp-1", specialties: { short_name: "ENT" },
});
const folder = (id: string, name: string, body: string | null): FolderTextRow => ({
  id, name, body, subsection_id: "sub-1",
  subsections: { specialty_id: "sp-1", specialties: { short_name: "ENT" } },
});

describe("pageHits", () => {
  it("puts pages named after the term before pages that only mention it", () => {
    const hits = pageHits(
      [section("sub-2", "Guidelines", "Read before your ARCP."), section("sub-1", "ARCP", null)],
      [],
      "arcp",
    );
    expect(hits.map((h) => h.label)).toEqual(["ARCP", "Guidelines"]);
    expect(hits.every((h) => h.kind === "page")).toBe(true);
  });

  it("says where in the text the term is", () => {
    const [hit] = pageHits([section("sub-1", "Guidelines", "## Local\nRead these before your **first on-call**.")], [], "on-call");
    expect(hit.sublabel).toBe("ENT · Local Read these before your first on-call.");
  });

  it("names only the specialty when the page matched on its name", () => {
    const [hit] = pageHits([section("sub-1", "ARCP", "Nothing relevant here.")], [], "arcp");
    expect(hit.sublabel).toBe("ENT");
  });

  it("goes to the section, or into the folder whose text matched", () => {
    const hits = pageHits([section("sub-1", "ARCP", null)], [folder("fd-1", "Past papers", "Recalled papers")], "papers");
    expect(hits[0].path).toBe("/specialty/sp-1?subsection=sub-1");
    expect(hits[1].path).toBe("/specialty/sp-1?subsection=sub-1&folder=fd-1");
  });

  it("leaves out folders the folder search already found by name", () => {
    const hits = pageHits([], [folder("fd-1", "Past papers", "papers")], "papers", { skipFolderIds: new Set(["fd-1"]) });
    expect(hits).toEqual([]);
  });
});
