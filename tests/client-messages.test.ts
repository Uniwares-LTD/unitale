import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("the new-run page receives its messages before the dynamic run route", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `import assert from 'node:assert/strict';
       import { clientMessages } from './src/lib/server/client-messages.ts';
       import messages from './messages/en.json' with { type: 'json' };
       for (const pathname of ['/runs/new', '/runs/new/']) {
         assert.equal(clientMessages(messages, pathname).ui.m0b01328f236c, 'Start run');
       }`,
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
