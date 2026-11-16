// Stripe over plain fetch. The official SDK is large and pulls in Node shims;
// these functions make four kinds of call between them, so the REST API with a
// form-encoded body is the smaller, more legible dependency.

const API = "https://api.stripe.com/v1";

export function stripeConfigured(): boolean {
  return !!Deno.env.get("STRIPE_SECRET_KEY") && !!Deno.env.get("STRIPE_PRICE_ID");
}

/** Stripe's nested form encoding: {a: {b: 1}, c: [2]} → a[b]=1&c[0]=2. */
function encode(value: unknown, prefix: string, out: URLSearchParams) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => encode(v, `${prefix}[${i}]`, out));
  } else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      encode(v, prefix ? `${prefix}[${k}]` : k, out);
    }
  } else {
    out.append(prefix, String(value));
  }
}

export function formEncode(params: Record<string, unknown>): URLSearchParams {
  const out = new URLSearchParams();
  encode(params, "", out);
  return out;
}

export async function stripe<T = Record<string, unknown>>(
  method: "GET" | "POST" | "DELETE", path: string, params?: Record<string, unknown>,
): Promise<T> {
  const body = formEncode(params ?? {});

  const res = await fetch(`${API}${path}${method === "GET" && params ? `?${body}` : ""}`, {
    method,
    headers: {
      Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "GET" ? undefined : body,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe ${method} ${path}: ${data?.error?.message ?? res.status}`);
  }
  return data as T;
}

/**
 * Verify a webhook's Stripe-Signature header: HMAC-SHA256 of "<t>.<raw body>"
 * under the endpoint's signing secret, compared in constant time, and refused
 * if the timestamp is more than five minutes old (a replayed delivery).
 */
export async function verifyWebhook(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const timestamp = parts.find(([k]) => k === "t")?.[1];
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");

  return signatures.some((candidate) => {
    if (candidate.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}
