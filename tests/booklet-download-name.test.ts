import assert from "node:assert/strict";
import { test } from "node:test";
import { pictureDisposition } from "../src/project/booklets/download-name";

test("picture downloads keep the real file type and a safe name", () => {
  assert.equal(pictureDisposition(null, "image/webp"), "inline");
  assert.equal(pictureDisposition("  ", "image/webp"), "inline");
  assert.equal(
    pictureDisposition("Mina’s Hello – Page 1", "image/webp"),
    `attachment; filename="Mina_s Hello _ Page 1.webp"; filename*=UTF-8''Mina%E2%80%99s%20Hello%20%E2%80%93%20Page%201.webp`,
  );
  // Path, quote and control characters never reach the header.
  assert.equal(
    pictureDisposition('../a"b\r\nc', "image/png"),
    `attachment; filename=".. a b c.png"; filename*=UTF-8''..%20a%20b%20c.png`,
  );
  assert.match(
    pictureDisposition("مينا – الصفحة 2", "image/jpeg; charset=binary"),
    /filename\*=UTF-8''%D9%85.*\.jpg$/,
  );
  assert.match(pictureDisposition("x", "image/x-unknown"), /filename="x"/);
});
