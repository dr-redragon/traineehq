import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_PALETTE, PAGE, certificateContent, certificateLayout, safeText,
} from "./certificate";

/**
 * The certificate exists twice, and this is what keeps the two honest.
 *
 * `src/lib/register/certificate.ts` draws it in the browser, for an organiser
 * downloading or previewing one. `supabase/functions/register-api/certificate.ts`
 * draws the same document on the server, because the moment a certificate is
 * actually owed is the moment a trainee submits feedback — on their phone, at
 * night, with no organiser's browser open. Neither runtime can import the
 * other's module: one resolves through Vite's aliases, the other through URL
 * imports in Deno.
 *
 * So the duplication is deliberate and the drift is the risk. These tests read
 * the Deno file as text and assert that everything a reader could notice on the
 * paper — the words, the palette, the geometry — is the same on both sides. A
 * pixel-level comparison would need pdf-lib under Deno; this catches the class
 * of mistake that actually happens, which is changing one and forgetting the
 * other.
 */

// Resolved from the project root rather than from `import.meta.url`: the test
// runs through Vite, where the module's own URL is not a file: one.
const DENO_SOURCE = readFileSync(
  resolve(process.cwd(), "supabase/functions/register-api/certificate.ts"),
  "utf8",
);

/**
 * Read a numeric constant out of the Deno source by name.
 *
 * Evaluated rather than parsed, because these are written as the arithmetic
 * that explains them — `PAGE.height - 34`, or the sum of the seven line drops —
 * and it is that arithmetic, not a magic number, that has to match.
 */
function constant(name: string): number {
  const match = DENO_SOURCE.match(new RegExp(`const ${name} = ([^;]+);`));
  if (!match) throw new Error(`${name} is not declared in the server certificate`);
  return Number(new Function("PAGE", `return ${match[1]}`)(PAGE));
}

describe("the server certificate", () => {
  it("uses the same palette, to the last decimal", () => {
    for (const [name, channels] of Object.entries(CERTIFICATE_PALETTE)) {
      const line = DENO_SOURCE.match(new RegExp(`${name}: \\[([0-9., ]+)\\]`));
      expect(line, `${name} is missing from the server palette`).toBeTruthy();
      expect(line![1].split(",").map((n) => Number(n.trim()))).toEqual([...channels]);
    }
  });

  it("sits on the same page and in the same band", () => {
    expect(DENO_SOURCE).toContain("PAGE = { width: 842, height: 595 }");
    expect(constant("FOOT_RULE_Y")).toBe(82);
    expect(constant("TOP_LIMIT")).toBe(595 - 34);
    expect(constant("ASCENT")).toBe(11);
    expect(constant("DESCENT")).toBe(4);
    expect(constant("TEXT_BLOCK_DROP")).toBe(48 + 22 + 52 + 48 + 38 + 38 + 30);
    expect(DENO_SOURCE).toContain("LOGO_GAP = 20");
  });

  it("puts the composition where the browser puts it", () => {
    // Recomputed from the server's own constants, rather than trusting that
    // the two functions look alike.
    const layout = (logoHeight: number) => {
      const logoBlock = logoHeight > 0 ? logoHeight + 20 : 0;
      const blockHeight = logoBlock + constant("ASCENT") + constant("TEXT_BLOCK_DROP")
        + constant("DESCENT");
      const bandCentre = (constant("FOOT_RULE_Y") + constant("TOP_LIMIT")) / 2;
      return bandCentre + blockHeight / 2 - logoBlock - constant("ASCENT");
    };
    for (const logoHeight of [0, 40, 78]) {
      expect(layout(logoHeight)).toBeCloseTo(certificateLayout(logoHeight).eyebrowY, 6);
    }
  });

  it("draws the lines in the same order, at the same sizes", () => {
    // The sequence of centre() calls is the composition; a reordering here is a
    // different certificate even though every constant still matches.
    const calls = [...DENO_SOURCE.matchAll(/centre\(content\.(\w+), (\w+), ([\d.]+)/g)]
      .map((m) => `${m[1]}:${m[2]}:${m[3]}`);
    expect(calls).toEqual([
      "eyebrow:sansBold:11",
      "heading:serifBold:36",
      "lead:serif:14.5",
      "recipient:serifBold:32",
      "statement:serif:14.5",
      "sessionLine:sansBold:18",
      "whenLine:sans:13",
    ]);
  });

  it("says the same words", () => {
    // The wording lives in certificateContent on both sides; assert the strings
    // the browser produces are all present verbatim in the server's source.
    const content = certificateContent({
      traineeName: "Dr Example",
      registerName: "ENT",
      deaneryName: "North West",
      sessionTitle: "February teaching",
      sessionDate: "2026-02-11",
    });
    expect(content.heading).toBe("Certificate of Attendance");
    for (const phrase of [
      "Certificate of Attendance",
      "This is to certify that",
      "attended the teaching session",
      "Issued by ${register}",
      "Teaching register",
      "Attendee",
      "Teaching session",
    ]) {
      expect(DENO_SOURCE).toContain(phrase);
    }
  });

  it("folds the same letters that no standard PDF font can encode", () => {
    // Ł must not become "ukasz" on one side and "Lukasz" on the other.
    expect(safeText("Łukasz")).toBe("Lukasz");
    for (const pair of ['"Ł": "L"', '"đ": "d"', '"œ": "oe"', '"ı": "i"']) {
      expect(DENO_SOURCE).toContain(pair);
    }
  });

  it("names the file the same way", () => {
    expect(DENO_SOURCE).toContain("`certificate-${name}-${details.sessionDate}.pdf`");
  });
});
