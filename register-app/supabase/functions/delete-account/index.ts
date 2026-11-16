// Delete the caller's own account.
//
// The account removed is always the one in the token — this takes no user id
// from the request. In order:
//
//   1. cancel the Stripe subscription, so nobody is billed for an account
//      that no longer exists;
//   2. destroy the registers this person is the ONLY owner of — once they are
//      gone nobody could manage those, and they hold other people's data;
//   3. delete the auth user. Profile, memberships, invitations sent and the
//      subscription row all cascade from it.
//
// Registers with another owner are untouched: the person simply leaves them.
import { caller, CORS, json, service } from "../_shared/http.ts";
import { stripe } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const db = service();
    const user = await caller(req, db);
    if (!user) return json({ error: "Please sign in first" }, 401);

    const { data: sub } = await db.from("subscriptions")
      .select("stripe_subscription_id, status").eq("user_id", user.id).maybeSingle();

    if (sub?.stripe_subscription_id && ["active", "trialing", "past_due", "unpaid"].includes(sub.status)) {
      try {
        await stripe("DELETE", `/subscriptions/${sub.stripe_subscription_id}`);
      } catch (err) {
        // Refuse rather than delete the account and leave the card being charged.
        console.error("delete-account: could not cancel subscription", err);
        return json({
          error: "Your subscription could not be cancelled, so nothing was deleted. " +
            "Cancel it from Manage billing first, then try again.",
        }, 502);
      }
    }

    const { data: solo, error: soloErr } = await db.rpc("registers_solely_owned_by", { _user_id: user.id });
    if (soloErr) throw soloErr;
    const ids = (solo ?? []) as string[];
    if (ids.length) {
      const { error } = await db.from("registers").delete().in("id", ids);
      if (error) throw error;
    }

    const { error: delErr } = await db.auth.admin.deleteUser(user.id);
    if (delErr) throw delErr;

    return json({ deleted: true, registers_deleted: ids.length });
  } catch (err) {
    console.error("delete-account", err);
    return json({ error: "Could not delete the account. Please try again." }, 500);
  }
});
