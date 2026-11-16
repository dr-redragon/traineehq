// Start a subscription: answers with a Stripe Checkout URL for the browser.
//
// The subscription is tied to the caller three ways — the Stripe customer is
// stored against their user id, and the user id rides along as the session's
// client_reference_id and in the subscription's metadata — so the webhook can
// always tell whose it is, whichever event arrives first.
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

    const { data: existing } = await db.from("subscriptions")
      .select("stripe_customer_id, status").eq("user_id", user.id).maybeSingle();

    if (existing && ["active", "trialing", "past_due", "comp"].includes(existing.status)) {
      return json({ error: "You already have a subscription." }, 409);
    }

    let customerId = existing?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe<{ id: string }>("POST", "/customers", {
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      const { error } = await db.from("subscriptions").upsert(
        { user_id: user.id, stripe_customer_id: customerId },
        { onConflict: "user_id" },
      );
      if (error) throw error;
    }

    const session = await stripe<{ url: string }>("POST", "/checkout/sessions", {
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: Deno.env.get("STRIPE_PRICE_ID"), quantity: 1 }],
      subscription_data: { metadata: { user_id: user.id } },
      allow_promotion_codes: true,
      success_url: `${appBaseUrl()}/account?checkout=success`,
      cancel_url: `${appBaseUrl()}/account?checkout=cancelled`,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("billing-checkout", err);
    return json({ error: "Could not open the checkout. Please try again." }, 500);
  }
});
