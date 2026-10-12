import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildCsp, inlineScriptHashes, withCspMeta } from "./contentSecurityPolicy";

const SUPABASE = "https://abc.supabase.co";

describe("inlineScriptHashes", () => {
  it("hashes inline scripts exactly as the browser will", () => {
    const body = "\n  (function () { document.documentElement.classList.add('x'); })();\n";
    const html = `<head><script>${body}</script></head>`;
    const expected = createHash("sha256").update(body, "utf8").digest("base64");
    expect(inlineScriptHashes(html)).toEqual([`'sha256-${expected}'`]);
  });

  it("ignores external scripts", () => {
    expect(inlineScriptHashes(`<script type="module" src="/assets/index.js"></script>`)).toEqual([]);
  });
});

describe("buildCsp", () => {
  const csp = buildCsp({ supabaseUrl: SUPABASE, scriptHashes: ["'sha256-abc'"] });

  it("never allows inline or eval'd script", () => {
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src "))!;
    expect(scriptSrc).toBe("script-src 'self' 'sha256-abc'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
  });

  it("lets the app reach its own Supabase project and nothing else for data", () => {
    expect(csp).toContain(`connect-src 'self' ${SUPABASE} wss://abc.supabase.co`);
  });
});

describe("withCspMeta", () => {
  it("puts the policy first in <head>, with the inline script's hash", () => {
    const html = `<html><head><title>x</title><script>var a=1;</script></head></html>`;
    const out = withCspMeta(html, SUPABASE);
    expect(out).toMatch(/<head>\s*<meta http-equiv="Content-Security-Policy" content="default-src 'self';/);
    expect(out).toContain(inlineScriptHashes(html)[0]);
  });
});
