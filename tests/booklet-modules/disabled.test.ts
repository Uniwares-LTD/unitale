import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { AppError } from "../../src/lib/auth-policy";

// Booklets disabled: the module guard refuses. Modules come from the static
// project config, so the guard module is replaced for this test only.
mock.module("../../src/lib/server/modules.ts", {
  exports: {
    requireModule() {
      throw new AppError(
        "MODULE_UNAVAILABLE",
        "This feature is unavailable.",
        404,
      );
    },
  },
});

// Every database call fails loudly, proving refusal happens before data access.
const touched: string[] = [];
const db = new Proxy(
  {},
  {
    get: (_, name) =>
      name === "collection"
        ? (collection: string) =>
            new Proxy(
              {},
              {
                get: (_target, method) => () => {
                  touched.push(`${collection}.${String(method)}`);
                  throw new Error("Database touched");
                },
              },
            )
        : () => {
            touched.push(String(name));
            throw new Error("Database touched");
          },
  },
) as never;

test("disabled booklets module refuses every application and admin entry point", async () => {
  const { bookletApplication } =
    await import("../../src/lib/server/booklets/application");
  const { bookletAdminView, updateBookletRetryDefaults } =
    await import("../../src/lib/server/booklets/admin");
  const app = bookletApplication(
    db,
    { uid: "owner", authTime: 1 },
    { types: [] },
  );
  const admin = { uid: "admin", auth_time: 1 };
  const calls: [string, () => Promise<unknown>][] = [
    ["picker", () => app.picker()],
    ["packages", () => app.packages()],
    ["quote", () => app.quote({ action: "quote", catalogId: "c" })],
    ["start", () => app.start({})],
    ["view", () => app.view("p")],
    ["history", () => app.history("p", { kind: "runs" })],
    ["original", () => app.original("p", "a")],
    ["command", () => app.command("p", { action: "resume" })],
    ["admin view", () => bookletAdminView(db, admin)],
    ["admin update", () => updateBookletRetryDefaults(db, admin, {})],
  ];
  for (const [name, call] of calls)
    await assert.rejects(
      call,
      (error: unknown) =>
        (error as { code?: string }).code === "MODULE_UNAVAILABLE",
      name,
    );
  assert.deepEqual(touched, []);
});
