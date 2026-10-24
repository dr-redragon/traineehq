import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script, no types
import { planSections, resourceTypeFor } from "../../scripts/import-specialty-documents.mjs";

const manifestPath = path.resolve(__dirname, "../../content/nwpgmd/ent/manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

describe("import-specialty-documents", () => {
  it("files each section into the first matching existing section, else a new one", () => {
    const plan = planSections(manifest.sections, [
      { id: "b", name: "Curriculum & Training Programme", sort_order: 2 },
      { id: "a", name: "ARCP Preparation", sort_order: 1 },
      { id: "c", name: "Exam Preparation", sort_order: 3 },
    ]);
    const where = Object.fromEntries(plan.map((p: { section: { name: string }; subsection: { id: string } | null }) =>
      [p.section.name, p.subsection?.id ?? "new"]));
    expect(where).toEqual({
      "ARCP": "a",
      "Training Programme & Policies": "b",
      "Supervision & Reflection": "new",
      "Wellbeing & Support": "new",
    });
  });

  it("types files as the Add resource dialog does", () => {
    expect(resourceTypeFor("x.pdf")).toBe("pdf");
    expect(resourceTypeFor("x.docx")).toBe("document");
  });

  it("has every file it names, and nothing unnamed", () => {
    const named = manifest.sections.flatMap((s: { resources: { file?: string }[] }) =>
      s.resources.map((r) => r.file).filter(Boolean));
    const onDisk = fs.readdirSync(path.dirname(manifestPath)).filter((f) => f !== "manifest.json");
    expect([...named].sort()).toEqual(onDisk.sort());
  });

  it("gives every resource a title and exactly one of a file or a link", () => {
    for (const s of manifest.sections) for (const r of s.resources) {
      expect(r.title?.trim()).toBeTruthy();
      expect(Boolean(r.file) !== Boolean(r.url)).toBe(true);
    }
  });
});
