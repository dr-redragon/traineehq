// Copy supabase/email/layout.ts into every edge function that sends email.
// Each function deploys on its own, so each carries its own copy; this keeps
// them identical. src/test/emailLayoutSync.test.ts fails when they drift.
import { readFileSync, writeFileSync } from "node:fs";

export const EMAIL_FUNCTIONS = [
  "access-request-email", "admin-user", "contact-form-email", "invite-user",
  "register-api", "register-certificate", "register-invite",
];

export const HEADER =
  "// GENERATED from supabase/email/layout.ts by `npm run sync:email`. Do not edit here.\n";

const source = readFileSync(new URL("../supabase/email/layout.ts", import.meta.url), "utf8");
for (const fn of EMAIL_FUNCTIONS) {
  writeFileSync(new URL(`../supabase/functions/${fn}/email-layout.ts`, import.meta.url), HEADER + source);
}
console.log(`email-layout.ts synced into ${EMAIL_FUNCTIONS.length} functions`);
