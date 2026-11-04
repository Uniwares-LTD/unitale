import "server-only";
import { AppError } from "../../auth-policy";

export class ProviderResponseError extends AppError {
  constructor(readonly providerStatus: number) {
    super(
      "BILLING_PROVIDER_FAILED",
      "Provider verification requires reconciliation.",
      502,
    );
  }
}
export type ProviderFetch = typeof fetch;
// Bound both headers and body consumption. A timeout on a write is an unknown
// outcome; callers journal it and reconcile instead of automatically replaying.
export function providerTransport(
  origin: string,
  authorization: () => Promise<string>,
  fetcher: ProviderFetch = fetch,
) {
  if (
    ![
      "https://api.stripe.com",
      "https://androidpublisher.googleapis.com",
    ].includes(origin)
  )
    throw new Error("Unsupported billing provider origin.");
  return async (
    path: string,
    method = "GET",
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<unknown> => {
    if (
      !path.startsWith("/") ||
      path.startsWith("//") ||
      /(^|\/)\.\.(\/|$)/.test(path)
    )
      throw new Error("Invalid provider path.");
    const response = await fetcher(origin + path, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: await authorization(),
        ...(body === undefined
          ? {}
          : {
              "Content-Type": origin.includes("stripe")
                ? "application/x-www-form-urlencoded"
                : "application/json",
            }),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        ...(origin.includes("stripe")
          ? { "Stripe-Version": "2026-09-30.endive" }
          : {}),
      },
      body:
        body === undefined
          ? undefined
          : typeof body === "string"
            ? body
            : JSON.stringify(body),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ProviderResponseError(response.status);
    }
    const reader = response.body?.getReader();
    if (!reader) return {};
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.length;
        if (bytes > 1024 * 1024)
          throw new AppError(
            "BILLING_RESPONSE_LIMIT",
            "Provider response exceeds the verification limit.",
            502,
          );
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel();
    }
    if (!bytes) return {};
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  };
}
export type ProviderRequest = ReturnType<typeof providerTransport>;
export const pathPart = (value: string) => encodeURIComponent(value);
export function stripeForm(value: Record<string, unknown>) {
  const form = new URLSearchParams();
  const add = (key: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((item, i) => add(`${key}[${i}]`, item));
    else if (typeof v === "object")
      Object.entries(v).forEach(([k, item]) => add(`${key}[${k}]`, item));
    else form.append(key, String(v));
  };
  Object.entries(value).forEach(([key, v]) => add(key, v));
  return form.toString();
}
