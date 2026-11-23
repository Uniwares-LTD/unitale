import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookletTurnSchema,
  checkReply,
  encodeReply,
  readTurn,
  turnReferences,
  type BookletTurn,
} from "../src/project/booklets/turn-contract";

const target = { artifactId: "story", revisionId: "rev-1", contentHash: "a".repeat(64) };
const other = { ...target, revisionId: "rev-2" };
const question = (kind: "text" | "single" | "multiple", freeText = true) => ({
  type: "question" as const,
  kind,
  prompt: "Who is the book for?",
  options: kind === "text" ? [] : [
    { id: "a", label: "My daughter" },
    { id: "b", label: "My son" },
  ],
  freeText,
});
const turn = (...parts: unknown[]) => bookletTurnSchema.parse({ version: 1, parts });
const answer = (choices: string[], text = "") => ({ version: 1, kind: "answer", choices, text });

test("turns accept Manager-chosen parts in any order with one interaction", () => {
  const parsed = turn(
    { type: "prose", text: "Lovely idea." },
    { type: "synopsis", target, title: "Outline", body: "A dragon learns to share." },
    { type: "character", target, name: "Nika", description: "Six, loves stars.", assetId: "img-1" },
    { type: "milestone", label: "Story" },
    { type: "approval", target, subject: "the story outline" },
  );
  assert.deepEqual(
    turnReferences(parsed).map((r) => r.assetId),
    [null, "img-1", null],
  );
  assert.equal(turn(question("single"), { type: "prose", text: "Second." }).parts.length, 2);
});

test("turns reject malformed, foreign and ambiguous parts", () => {
  const bad = [
    { version: 1, parts: [] },
    { version: 2, parts: [question("text")] },
    { version: 1, parts: [{ type: "prose", text: "No question." }] },
    { version: 1, parts: [question("text"), question("single")] },
    { version: 1, parts: [question("single"), { type: "approval", target, subject: "x" }] },
    { version: 1, parts: [{ ...question("single"), options: [{ id: "a", label: "A" }] }] },
    { version: 1, parts: [{ ...question("text"), options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] }] },
    { version: 1, parts: [question("text", false)] },
    { version: 1, parts: [{ ...question("single"), options: [{ id: "a", label: "A" }, { id: "a", label: "B" }] }] },
    { version: 1, parts: [question("text"), { type: "html", text: "<b>x</b>" }] },
    { version: 1, parts: [question("text"), { type: "prose", text: "x", url: "https://example.com" }] },
    { version: 1, parts: [question("text"), { type: "milestone", label: "A" }, { type: "milestone", label: "B" }] },
    { version: 1, parts: [question("text"), { type: "image", target, assetId: "../x", alt: "x" }] },
  ];
  for (const value of bad) assert.equal(bookletTurnSchema.safeParse(value).success, false, JSON.stringify(value));
});

test("replies must answer the turn's interaction", () => {
  const ok = (t: BookletTurn, reply: unknown) => checkReply(t, reply).ok;
  assert.equal(ok(turn(question("text")), answer([], "For Nika")), true);
  assert.equal(ok(turn(question("text")), answer([])), false);
  assert.equal(ok(turn(question("text")), answer(["a"], "x")), false);
  assert.equal(ok(turn(question("single")), answer(["a"])), true);
  assert.equal(ok(turn(question("single")), answer(["a", "b"])), false);
  assert.equal(ok(turn(question("single")), answer(["a"], "and more")), false);
  assert.equal(ok(turn(question("single")), answer([], "Someone else")), true);
  assert.equal(ok(turn(question("single", false)), answer([], "Someone else")), false);
  assert.equal(ok(turn(question("single")), answer(["z"])), false);
  assert.equal(ok(turn(question("multiple")), answer(["a", "b"])), true);
  assert.equal(ok(turn(question("multiple")), answer(["a", "a"])), false);
  assert.equal(ok(turn(question("multiple")), answer([])), false);
  const styles = turn({ type: "styles", prompt: "Pick a style", options: [
    { id: "s1", label: "Watercolour", target, assetId: "img-1" },
    { id: "s2", label: "Crayon", target: other, assetId: "img-2" },
  ] });
  assert.equal(ok(styles, answer(["s2"])), true);
  assert.equal(ok(styles, answer([], "Something else")), false);
  const approval = turn({ type: "approval", target, subject: "the outline" });
  assert.equal(ok(approval, { version: 1, kind: "approve", target }), true);
  assert.equal(ok(approval, { version: 1, kind: "approve", target: other }), false);
  assert.equal(ok(approval, { version: 1, kind: "changes", target, text: "Make it longer" }), true);
  assert.equal(ok(approval, { version: 1, kind: "changes", target, text: " " }), false);
  assert.equal(ok(approval, answer([], "Approve")), false);
  assert.equal(ok(turn(question("text")), { version: 1, kind: "approve", target }), false);
  assert.equal(ok(turn(question("text")), { ...answer([], "x"), extra: 1 }), false);
});

test("encoded replies fit the raw-v1 response and turns round-trip from form content", () => {
  const longest = encodeReply({ version: 1, kind: "answer", choices: Array.from({ length: 12 }, (_, i) => "x".repeat(63) + i.toString(16)), text: "ي".repeat(2000) });
  assert.ok(longest.length <= 4000);
  const t = turn(question("text"));
  const form = "```unibase-ui\n{}\n```\n```booklet-turn\n" + JSON.stringify(t) + "\n```\n{{#$output.response#}}";
  assert.deepEqual(readTurn(form), t);
  assert.equal(readTurn(form + "\n```booklet-turn\n" + JSON.stringify(t) + "\n```"), null);
  assert.equal(readTurn("```booklet-turn\n{not json}\n```"), null);
  assert.equal(readTurn("no turn"), null);
});
