// Stripe's own billing portal for the caller: card, invoices, cancelling.
// Enable the portal once in the Stripe dashboard (Settings → Billing →
// Customer portal) or this returns an error from Stripe.
import { appBaseUrl, caller, CORS, json, service } from "../_shared/http.ts";
import { stripe, stripeConfigured } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    if (!stripeConfigured()) {
      return json({ error: "Subscriptions are not set up on this site yet." }, 503);
    }

    const db = service();
    const user = await caller(req, db);
    if (!user) return json({ error: "Please sign in first" }, 401);

    const { data: row } = await db.from("subscriptions")
      .select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
    if (!row?.stripe_customer_id) {
      return json({ error: "There is no billing record for this account." }, 404);
    }

    const portal = await stripe<{ url: string }>("POST", "/billing_portal/sessions", {
      customer: row.stripe_customer_id,
      return_url: `${appBaseUrl()}/account`,
    });
    return json({ url: portal.url });
  } catch (err) {
    console.error("billing-portal", err);
    return json({ error: "Could not open billing. Please try again." }, 500);
  }
});
