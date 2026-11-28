import assert from "node:assert/strict";
import test from "node:test";
import {
  readerRange,
  readerStep,
} from "../src/project/components/conversation/reader-position";

test("reader separates cover, pairs story pages, and clamps navigation", () => {
  assert.deepEqual(readerRange(0, 5, true), [0]);
  assert.deepEqual(readerRange(2, 5, true), [1, 2]);
  assert.deepEqual(readerRange(4, 5, true), [3, 4]);
  assert.deepEqual(readerRange(3, 4, true), [3]);
  assert.equal(readerStep(0, 5, true, 1), 1);
  assert.equal(readerStep(1, 5, true, 1), 3);
  assert.equal(readerStep(3, 5, true, -1), 1);
  assert.equal(readerStep(1, 5, true, -1), 0);
  assert.equal(readerStep(4, 5, false, 1), 4);
  assert.equal(readerStep(0, 5, false, -1), 0);
  assert.deepEqual(readerRange(0, 4, true, false), [0, 1]);
  assert.deepEqual(readerRange(3, 4, true, false), [2, 3]);
  assert.equal(readerStep(2, 4, true, -1, false), 0);
  assert.deepEqual(readerRange(9, 1, true), [0]);
  assert.deepEqual(readerRange(0, 0, true), []);
});
