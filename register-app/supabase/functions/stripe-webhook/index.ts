// Stripe tells us what a subscription's state is; this writes it down.
//
// This is the ONLY writer of subscriptions.status, and that column is what
// has_active_subscription() — and so every plan rule in the database — reads.
// Nothing the browser says about payment is ever believed.
//
// Deployed with verify_jwt = false (Stripe sends no Supabase token). Its
// authority is the signature on the raw body, checked before anything else.
//
// Subscribe the endpoint to:
//   checkout.session.completed
//   customer.subscription.created / .updated / .deleted
import { json, service } from "../_shared/http.ts";
import { stripe, verifyWebhook } from "../_shared/stripe.ts";

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end?: number;
  metadata?: { user_id?: string };
  items?: { data?: { price?: { id?: string }; current_period_end?: number }[] };
}

async function record(sub: StripeSubscription, userIdHint?: string | null) {
  const db = service();

  // Whose is it? The metadata we set at checkout, else whoever holds the customer.
  let userId = sub.metadata?.user_id || userIdHint || null;
  if (!userId) {
    const { data } = await db.from("subscriptions")
      .select("user_id").eq("stripe_customer_id", sub.customer).maybeSingle();
    userId = data?.user_id ?? null;
  }
  if (!userId) {
    console.error("stripe-webhook: no user for subscription", sub.id, sub.customer);
    return;
  }

  const item = sub.items?.data?.[0];
  // Newer API versions report the period on the item rather than the subscription.
  const periodEnd = sub.current_period_end ?? item?.current_period_end;

  // A complimentary plan is given by hand and is not Stripe's to take away.
  const { data: current } = await db.from("subscriptions")
    .select("status, stripe_subscription_id").eq("user_id", userId).maybeSingle();
  if (current?.status === "comp") return;

  // An old subscription being cancelled must not switch off a newer one.
  if (current?.stripe_subscription_id && current.stripe_subscription_id !== sub.id &&
      !["active", "trialing", "past_due"].includes(sub.status)) {
    return;
  }

  const { error } = await db.from("subscriptions").upsert({
    user_id: userId,
    stripe_customer_id: sub.customer,
    stripe_subscription_id: sub.id,
    status: sub.status,
    price_id: item?.price?.id ?? null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
  }, { onConflict: "user_id" });
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return json({ error: "Webhook secret not configured" }, 503);

  // The signature is over the exact bytes sent, so read the body as text and
  // parse it only once it has been verified.
  const raw = await req.text();
  if (!await verifyWebhook(raw, req.headers.get("stripe-signature"), secret)) {
    return json({ error: "Bad signature" }, 400);
  }

  try {
    const event = JSON.parse(raw) as { type: string; data: { object: Record<string, unknown> } };
    const object = event.data.object;

    switch (event.type) {
      case "checkout.session.completed": {
        if (object.mode === "subscription" && typeof object.subscription === "string") {
          // Fetched rather than trusted from the event: the session carries
          // only the subscription's id, not its status or period.
          const sub = await stripe<StripeSubscription>("GET", `/subscriptions/${object.subscription}`);
          await record(sub, object.client_reference_id as string | null);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await record(object as unknown as StripeSubscription);
        break;
      default:
        // Acknowledged and ignored, so Stripe does not keep retrying it.
        break;
    }
    return json({ received: true });
  } catch (err) {
    // A 500 makes Stripe retry, which is what we want for a database hiccup.
    console.error("stripe-webhook", err);
    return json({ error: "Could not record the event" }, 500);
  }
});
