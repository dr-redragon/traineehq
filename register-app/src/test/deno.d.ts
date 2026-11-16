// The edge functions run on Deno. One test imports their Stripe helpers, which
// mention `Deno.env` inside functions it never calls; this is just enough of
// the global for the type-checker.
declare const Deno: { env: { get(key: string): string | undefined } };
