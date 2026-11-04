import "server-only";
import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type JsonWebKey,
} from "node:crypto";
import { z } from "zod";
import { AppError } from "../../auth-policy";
const invalid = () =>
  new AppError(
    "INVALID_PLAY_IDENTITY",
    "Google billing identity could not be verified.",
    401,
  );
async function boundedJson(response: Response) {
  if (!response.ok) {
    await response.body?.cancel();
    throw invalid();
  }
  const reader = response.body?.getReader();
  if (!reader) throw invalid();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 65536) throw invalid();
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function googlePublisherAuthorization(
  serviceAccount: unknown,
  fetcher: typeof fetch = fetch,
) {
  const account = z
    .object({ client_email: z.email(), private_key: z.string().min(1) })
    .parse(serviceAccount);
  const privateKey = createPrivateKey(account.private_key);
  let cached: { token: string; until: number } | null = null;
  return async () => {
    if (cached && cached.until > Date.now() + 60000)
      return "Bearer " + cached.token;
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const unsigned =
      encode({ alg: "RS256", typ: "JWT" }) +
      "." +
      encode({
        iss: account.client_email,
        scope: "https://www.googleapis.com/auth/androidpublisher",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      });
    const assertion =
      unsigned +
      "." +
      sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString(
        "base64url",
      );
    const result = z
      .object({
        access_token: z.string().min(1),
        token_type: z.literal("Bearer"),
        expires_in: z.number().int().positive().max(3600),
      })
      .parse(
        await boundedJson(
          await fetcher("https://oauth2.googleapis.com/token", {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(10000),
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
              assertion,
            }).toString(),
          }),
        ),
      );
    cached = {
      token: result.access_token,
      until: Date.now() + result.expires_in * 1000,
    };
    return "Bearer " + cached.token;
  };
}
export async function verifyPlayPush(
  authorization: string,
  audience: string,
  email: string,
  fetcher: typeof fetch = fetch,
) {
  if (!authorization.startsWith("Bearer ") || authorization.length > 16384)
    throw invalid();
  const parts = authorization.slice(7).split(".");
  if (parts.length !== 3) throw invalid();
  const decode = (part: string) =>
    JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  const header = z
    .object({ alg: z.literal("RS256"), kid: z.string().min(1) })
    .parse(decode(parts[0]));
  const claims = z
    .object({
      iss: z.enum(["accounts.google.com", "https://accounts.google.com"]),
      aud: z.literal(audience),
      email: z.literal(email),
      email_verified: z.literal(true),
      exp: z.number().int(),
      iat: z.number().int(),
      sub: z.string().min(1),
    })
    .parse(decode(parts[1]));
  const now = Math.floor(Date.now() / 1000);
  if (
    claims.exp <= now ||
    claims.iat > now + 30 ||
    claims.exp - claims.iat > 3600
  )
    throw invalid();
  const keys = z
    .object({
      keys: z
        .array(
          z.object({
            kid: z.string(),
            kty: z.literal("RSA"),
            alg: z.literal("RS256"),
            use: z.literal("sig"),
            n: z.string(),
            e: z.string(),
          }),
        )
        .max(20),
    })
    .parse(
      await boundedJson(
        await fetcher("https://www.googleapis.com/oauth2/v3/certs", {
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        }),
      ),
    );
  const key = keys.keys.find((v) => v.kid === header.kid);
  if (!key) throw invalid();
  if (
    !verify(
      "RSA-SHA256",
      Buffer.from(parts[0] + "." + parts[1]),
      createPublicKey({ key: key as JsonWebKey, format: "jwk" }),
      Buffer.from(parts[2], "base64url"),
    )
  )
    throw invalid();
}
