import assert from "node:assert/strict";
import { test } from "node:test";
import {
  conversationPaused,
  type BookletConversation,
} from "../src/project/booklets/application-contract";

const base = {
  completed: false,
  working: false,
  activity: null,
  turns: [],
} as unknown as BookletConversation;
const turn = (status: string) =>
  ({ status }) as BookletConversation["turns"][number];

test("library and page agree on when a book is paused", () => {
  assert.equal(conversationPaused(base), true, "nothing running or asking");
  assert.equal(conversationPaused({ ...base, working: true }), false);
  assert.equal(conversationPaused({ ...base, completed: true }), false);
  assert.equal(conversationPaused({ ...base, turns: [turn("open")] }), false);
  assert.equal(conversationPaused({ ...base, turns: [turn("stale")] }), false);
  assert.equal(
    conversationPaused({ ...base, working: true, turns: [turn("expired")] }),
    true,
    "an expired question pauses even while the job still runs",
  );
});
