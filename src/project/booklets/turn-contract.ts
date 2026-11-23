import { z } from "zod";
import { bookletSourceV2Schema } from "./contracts-v2";

// Client-safe booklet conversation contract (version 1). An agent turn is the
// typed presentation of one Manager Human Input request; a reply is the owner's
// typed raw-v1 response to it. Manager chooses which parts appear and in what
// order; the app validates and renders them, and never derives state from them.
const target = bookletSourceV2Schema;
const optionId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const label = z.string().trim().min(1).max(160);
const body = (max: number) => z.string().trim().min(1).max(max);
const assetId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const option = z.strictObject({ id: optionId, label });

const prose = z.strictObject({ type: z.literal("prose"), text: body(4000) });
const question = z.strictObject({
  type: z.literal("question"),
  kind: z.enum(["text", "single", "multiple"]),
  prompt: body(500),
  options: z.array(option).max(12),
  // Whether a typed answer is accepted besides (or, for text, instead of) chips.
  freeText: z.boolean(),
});
const overview = z.strictObject({
  type: z.literal("overview"),
  target,
  title: label,
  facts: z
    .array(z.strictObject({ label, value: body(500) }))
    .min(1)
    .max(12),
});
const synopsis = z.strictObject({
  type: z.literal("synopsis"),
  target,
  title: label,
  body: body(6000),
});
const subject = <T extends "character" | "location">(type: T) =>
  z.strictObject({
    type: z.literal(type),
    target,
    name: label,
    description: body(2000),
    assetId: assetId.nullable(),
  });
const styles = z.strictObject({
  type: z.literal("styles"),
  prompt: body(500),
  options: z
    .array(z.strictObject({ id: optionId, label, target, assetId }))
    .min(2)
    .max(6),
});
const image = z.strictObject({
  type: z.literal("image"),
  target,
  assetId,
  alt: body(300),
});
const approval = z.strictObject({
  type: z.literal("approval"),
  target,
  // What is being approved, e.g. "the story outline"; shown with the buttons.
  subject: label,
});
const milestone = z.strictObject({ type: z.literal("milestone"), label });

export const bookletTurnPartSchema = z.discriminatedUnion("type", [
  prose,
  question,
  overview,
  synopsis,
  subject("character"),
  subject("location"),
  styles,
  image,
  approval,
  milestone,
]);
export type BookletTurnPart = z.infer<typeof bookletTurnPartSchema>;
const interactive = new Set(["question", "styles", "approval"]);
const unique = (values: string[]) => new Set(values).size === values.length;

export const bookletTurnSchema = z
  .strictObject({
    version: z.literal(1),
    parts: z.array(bookletTurnPartSchema).min(1).max(20),
  })
  .superRefine((turn, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    // One reply answers one thing: exactly one question, style choice or approval.
    if (turn.parts.filter((p) => interactive.has(p.type)).length !== 1)
      issue("A turn needs exactly one question, style choice or approval.");
    if (turn.parts.filter((p) => p.type === "milestone").length > 1)
      issue("A turn has at most one milestone.");
    for (const part of turn.parts) {
      if (part.type === "question") {
        if (!unique(part.options.map((o) => o.id)))
          issue("Question option IDs must be unique.");
        if (part.kind === "text" ? part.options.length : part.options.length < 2)
          issue("Question options must match its kind.");
        if (part.kind === "text" && !part.freeText)
          issue("A text question accepts typed answers.");
      }
      if (part.type === "styles" && !unique(part.options.map((o) => o.id)))
        issue("Style option IDs must be unique.");
    }
  });
export type BookletTurn = z.infer<typeof bookletTurnSchema>;

// Every exact revision a turn shows, with the media it shows for it. The server
// binds these to the request targets and to the revisions' retained assets.
export function turnReferences(turn: BookletTurn) {
  return turn.parts.flatMap((part) => {
    switch (part.type) {
      case "overview":
      case "synopsis":
      case "approval":
        return [{ target: part.target, assetId: null }];
      case "character":
      case "location":
        return [{ target: part.target, assetId: part.assetId }];
      case "image":
        return [{ target: part.target, assetId: part.assetId }];
      case "styles":
        return part.options.map((o) => ({ target: o.target, assetId: o.assetId }));
      default:
        return [];
    }
  });
}

export const bookletReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    version: z.literal(1),
    kind: z.literal("answer"),
    choices: z.array(optionId).max(12),
    text: z.string().trim().max(2000),
  }),
  z.strictObject({ version: z.literal(1), kind: z.literal("approve"), target }),
  // Feedback is never approval: a change request names its target and text.
  z.strictObject({
    version: z.literal(1),
    kind: z.literal("changes"),
    target,
    text: body(2000),
  }),
]);
export type BookletReply = z.infer<typeof bookletReplySchema>;

const sameTarget = (a: z.infer<typeof target>, b: z.infer<typeof target>) =>
  a.artifactId === b.artifactId &&
  a.revisionId === b.revisionId &&
  a.contentHash === b.contentHash;

// Validates a reply against the turn it answers. Returns the reply, or a short
// reason the composer can show while keeping the user's text.
export function checkReply(
  turn: BookletTurn,
  raw: unknown,
): { ok: true; reply: BookletReply } | { ok: false; reason: string } {
  const parsed = bookletReplySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "Unsupported reply." };
  const reply = parsed.data;
  const part = turn.parts.find(
    (p): p is Extract<BookletTurnPart, { type: "question" | "styles" | "approval" }> =>
      interactive.has(p.type),
  )!;
  if (part.type === "approval") {
    if (reply.kind === "answer")
      return { ok: false, reason: "Approve or request changes." };
    return sameTarget(reply.target, part.target)
      ? { ok: true, reply }
      : { ok: false, reason: "This reply targets a different version." };
  }
  if (reply.kind !== "answer")
    return { ok: false, reason: "This turn asks a question." };
  const kind = part.type === "styles" ? "single" : part.kind;
  const freeText = part.type === "styles" ? false : part.freeText;
  const offered = new Set(part.options.map((o) => o.id));
  if (!unique(reply.choices) || reply.choices.some((c) => !offered.has(c)))
    return { ok: false, reason: "Choose an offered answer." };
  if (reply.text && !freeText)
    return { ok: false, reason: "Choose one of the offered answers." };
  if (kind === "text" && (reply.choices.length || !reply.text))
    return { ok: false, reason: "Type an answer." };
  if (kind === "single" && reply.choices.length + (reply.text ? 1 : 0) !== 1)
    return { ok: false, reason: "Choose one answer." };
  if (kind === "multiple" && !reply.choices.length && !reply.text)
    return { ok: false, reason: "Choose at least one answer." };
  return { ok: true, reply };
}

// The raw-v1 response text the native Human Input receives.
export function encodeReply(reply: BookletReply) {
  return JSON.stringify(reply);
}

// Fenced block that carries the turn inside the native form content, next to
// the generic `unibase-ui` fallback cards. Exactly one block per form.
export const turnFence = "booklet-turn";
export function readTurn(formContent: string): BookletTurn | null {
  const matches = [
    ...formContent.matchAll(/```booklet-turn\n([\s\S]*?)\n```/g),
  ];
  if (matches.length !== 1) return null;
  try {
    const turn = bookletTurnSchema.safeParse(JSON.parse(matches[0][1]));
    return turn.success ? turn.data : null;
  } catch {
    return null;
  }
}
