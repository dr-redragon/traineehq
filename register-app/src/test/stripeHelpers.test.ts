import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { formEncode, verifyWebhook } from "../../supabase/functions/_shared/stripe";

/*
 * The webhook is the only thing that can mark an account as paying, and its
 * whole authority is this signature check — so it is pinned here, against
 * signatures made the way Stripe documents making them.
 */
const SECRET = "whsec_test_secret";
const BODY = JSON.stringify({ type: "customer.subscription.updated", data: { object: { id: "sub_1" } } });

const sign = (body: string, t: number, secret = SECRET) =>
  createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");

const now = () => Math.floor(Date.now() / 1000);

describe("verifyWebhook", () => {
  it("accepts a correctly signed, recent delivery", async () => {
    const t = now();
    expect(await verifyWebhook(BODY, `t=${t},v1=${sign(BODY, t)}`, SECRET)).toBe(true);
  });

  it("accepts when any one of several v1 signatures matches (secret rotation)", async () => {
    const t = now();
    const header = `t=${t},v1=${"0".repeat(64)},v1=${sign(BODY, t)}`;
    expect(await verifyWebhook(BODY, header, SECRET)).toBe(true);
  });

  it("refuses a body that was changed after signing", async () => {
    const t = now();
    const forged = BODY.replace("sub_1", "sub_2");
    expect(await verifyWebhook(forged, `t=${t},v1=${sign(BODY, t)}`, SECRET)).toBe(false);
  });

  it("refuses a signature made with another secret", async () => {
    const t = now();
    expect(await verifyWebhook(BODY, `t=${t},v1=${sign(BODY, t, "whsec_other")}`, SECRET)).toBe(false);
  });

  it("refuses a replay: a valid signature on an old timestamp", async () => {
    const t = now() - 3600;
    expect(await verifyWebhook(BODY, `t=${t},v1=${sign(BODY, t)}`, SECRET)).toBe(false);
  });

  it("refuses a missing or malformed header", async () => {
    expect(await verifyWebhook(BODY, null, SECRET)).toBe(false);
    expect(await verifyWebhook(BODY, "nonsense", SECRET)).toBe(false);
    expect(await verifyWebhook(BODY, `t=${now()}`, SECRET)).toBe(false);
  });
});

describe("formEncode", () => {
  it("writes nested objects and arrays the way Stripe reads them", () => {
    const encoded = formEncode({
      mode: "subscription",
      line_items: [{ price: "price_1", quantity: 1 }],
      subscription_data: { metadata: { user_id: "u1" } },
      skipped: undefined,
    });
    expect(Object.fromEntries(encoded)).toEqual({
      mode: "subscription",
      "line_items[0][price]": "price_1",
      "line_items[0][quantity]": "1",
      "subscription_data[metadata][user_id]": "u1",
    });
  });
});
