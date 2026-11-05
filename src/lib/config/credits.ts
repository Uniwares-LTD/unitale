import { project } from "../project";
import { z } from "zod";

const packSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,64}$/),
    label: z.string().trim().min(1).max(80),
    credits: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    amountMinor: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    currency: z
      .string()
      .regex(/^[a-z]{3}$/)
      .optional(),
    stripePriceId: z
      .string()
      .regex(/^price_[A-Za-z0-9]+$/)
      .optional(),
    playProductId: z
      .string()
      .regex(/^[a-z0-9][a-z0-9._]{0,127}$/)
      .optional(),
  })
  .strict();

// These are deliberately local fixtures, not production prices/product IDs.
const fixturePacks = [100, 500, 1000].map((credits) => ({
  id: `simulation-${credits}`,
  label: `${credits} simulated credits`,
  credits,
}));

export function parseCreditConfig(
  input: Record<string, string | undefined>,
  environment: "local" | "staging" | "production",
  authMode: "emulator" | "firebase",
) {
  const mode = parsePaymentMode(input, environment, authMode);
  let raw: unknown = mode === "simulation" ? fixturePacks : [];
  if (input.CREDIT_PACKS_JSON) {
    try {
      raw = JSON.parse(input.CREDIT_PACKS_JSON);
    } catch {
      throw new Error("Invalid credit configuration: CREDIT_PACKS_JSON.");
    }
  }
  const parsed = z.array(packSchema).max(50).safeParse(raw);
  if (
    !parsed.success ||
    new Set(parsed.data.map((pack) => pack.id)).size !== parsed.data.length ||
    (mode === "simulation" && !parsed.data.length) ||
    (mode === "stripe" &&
      parsed.success &&
      parsed.data.some(
        (pack) => !pack.stripePriceId || !pack.amountMinor || !pack.currency,
      )) ||
    (parsed.success &&
      new Set(
        parsed.data.flatMap((pack) =>
          pack.stripePriceId ? [pack.stripePriceId] : [],
        ),
      ).size !== parsed.data.filter((pack) => pack.stripePriceId).length)
  )
    throw new Error("Invalid credit configuration: CREDIT_PACKS_JSON.");
  return {
    mode: mode as "disabled" | "simulation" | "stripe",
    packs: parsed.data,
  };
}

// Connection activation is independent of the once-seeded catalog policy.
export function parsePaymentMode(
  input: Record<string, string | undefined>,
  environment: "local" | "staging" | "production",
  authMode: "emulator" | "firebase",
) {
  const simulationAllowed = environment === "local" && authMode === "emulator";
  const mode =
    input.PAYMENTS_MODE ??
    (simulationAllowed && project.examples ? "simulation" : "disabled");
  if (
    !["disabled", "simulation", "stripe"].includes(mode) ||
    (mode === "simulation" && !simulationAllowed)
  )
    throw new Error("Invalid credit configuration: PAYMENTS_MODE.");
  return mode as "disabled" | "simulation" | "stripe";
}
