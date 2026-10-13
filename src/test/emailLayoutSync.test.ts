import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderEmail, esc, DEFAULT_PALETTE } from "../../supabase/email/layout";

const FUNCTIONS = [
  "access-request-email", "admin-user", "contact-form-email", "invite-user",
  "register-api", "register-certificate", "register-invite",
];
const root = resolve(__dirname, "../..");
const HEADER = "// GENERATED from supabase/email/layout.ts by `npm run sync:email`. Do not edit here.\n";

/*
 * Every function that sends mail carries its own copy of the email layout,
 * because each deploys on its own. They must all be the source, exactly.
 */
describe("email layout copies", () => {
  const source = readFileSync(resolve(root, "supabase/email/layout.ts"), "utf8");
  it.each(FUNCTIONS)("%s matches supabase/email/layout.ts (run npm run sync:email)", (fn) => {
    const copy = readFileSync(resolve(root, `supabase/functions/${fn}/email-layout.ts`), "utf8");
    expect(copy).toBe(HEADER + source);
  });
});

describe("renderEmail", () => {
  it("escapes the plain-text parts and keeps the brand", () => {
    const html = renderEmail({
      kicker: "Account", heading: "Hi <b>there</b>", body: "<p>ok</p>",
      button: { label: "Go", url: "https://traineehq.com/x?a=1&b=2" },
      reason: "Because <you> asked",
    }, DEFAULT_PALETTE);
    expect(html).toContain("TraineeHQ");
    expect(html).toContain("Hi &lt;b&gt;there&lt;/b&gt;");
    expect(html).toContain("Because &lt;you&gt; asked");
    expect(html).toContain("https://traineehq.com/x?a=1&amp;b=2");
    expect(html).toContain(DEFAULT_PALETTE.accent);
    expect(html).not.toContain("HST Training Hub");
  });

  it("escapes", () => expect(esc(`<a href="x">'`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;"));
});
