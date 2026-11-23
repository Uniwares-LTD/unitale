import assert from "node:assert/strict";
import test from "node:test";
import {
  defineExtension,
  extensionAdminSections,
  extensionLinks,
  isFocusedPath,
  validateExtensions,
} from "../src/lib/extensions";

const notes = defineExtension({
  id: "notes",
  module: {
    requires: ["files"],
    configuration: [],
    routes: ["/notes", "/api/notes"],
    workers: [],
    collections: ["notes"],
  },
  routes: [
    {
      href: "/notes",
      placement: "main",
      label: () => "Notes",
      icon: "notebook-pen",
    },
    {
      href: "/notes/archive",
      placement: "account",
      label: () => "Archive",
      icon: "notebook-pen",
    },
  ],
  adminSections: [
    { href: "/admin/notes", label: "Notes", description: "Review notes." },
  ],
});

test("extensions contribute links and admin sections only when enabled", () => {
  const translate = (() => "") as never;
  assert.deepEqual(
    extensionLinks([notes], "main", translate).map((link) => link.href),
    ["/notes"],
  );
  assert.deepEqual(
    extensionLinks([notes], "account", translate).map((link) => link.label),
    ["Archive"],
  );
  assert.deepEqual(
    extensionAdminSections([notes], () => true).map((s) => s.href),
    ["/admin/notes"],
  );
  assert.deepEqual(
    extensionAdminSections([notes], () => false),
    [],
  );
});

test("invalid or colliding extensions are rejected", () => {
  const core = {
    ids: ["credits", "files"],
    collections: ["privateFiles"],
    routes: ["/admin", "/api/auth", "/files", "/api/files"],
  };
  // Each case changes one rule; links are cleared so link checks do not mask it.
  const bare = { ...notes, routes: [], adminSections: [] };
  const withRoutes = (routes: string[]) => ({
    ...bare,
    module: { ...notes.module, routes },
  });
  assert.doesNotThrow(() => validateExtensions(core, [notes]));
  assert.doesNotThrow(() =>
    validateExtensions(core, [withRoutes(["/administrators"])]),
  );
  for (const extension of [
    { ...notes, id: "files" },
    { ...notes, id: "Bad id" },
    { ...notes, module: { ...notes.module, requires: ["missing"] } },
    { ...notes, module: { ...notes.module, collections: ["privateFiles"] } },
    withRoutes(["/admin/notes"]),
    withRoutes(["/api/auth/notes"]),
    withRoutes(["/Notes"]),
    withRoutes(["/api"]),
    {
      ...notes,
      routes: [{ ...notes.routes![0], href: "/files/notes" }],
    },
    // Overlapping a core prefix would gate the extension by the core module.
    withRoutes(["/files/notes"]),
  ])
    assert.throws(() => validateExtensions(core, [extension]));
  assert.throws(() =>
    validateExtensions(core, [
      notes,
      {
        ...notes,
        id: "notes-copy",
        module: { ...notes.module, routes: ["/notes-copy"], collections: [] },
      },
    ]),
  );
  // Later extensions may depend on earlier ones, not the reverse.
  const board = {
    ...notes,
    id: "board",
    module: { ...notes.module, routes: ["/board"], collections: [] },
    routes: [],
    adminSections: [],
  };
  const dependent = {
    ...board,
    module: { ...board.module, requires: ["notes"] },
  };
  assert.doesNotThrow(() => validateExtensions(core, [notes, dependent]));
  assert.throws(() =>
    validateExtensions(core, [
      notes,
      { ...board, module: { ...board.module, routes: ["/notes/board"] } },
    ]),
  );
  assert.throws(() => validateExtensions(core, [dependent, notes]));
});

test("focused routes stay inside the extension's own pages", () => {
  const core = { ids: ["files"], collections: [], routes: ["/files"] };
  const focused = (focusedRoutes: string[]) => ({
    ...notes,
    routes: [],
    adminSections: [],
    focusedRoutes,
  });
  assert.doesNotThrow(() =>
    validateExtensions(core, [focused(["/notes", "/notes/write"])]),
  );
  for (const paths of [
    ["/files"], // another module's pages
    ["/api/notes"], // API paths have no frame
    ["/notes-other"], // a prefix is not ownership
    ["/Notes"],
    ["/notes", "/notes"],
  ])
    assert.throws(() => validateExtensions(core, [focused(paths)]), paths.join());
  const extensions = [focused(["/notes/write"])];
  assert.equal(isFocusedPath(extensions, "/notes/write"), true);
  assert.equal(isFocusedPath(extensions, "/notes/write/1"), true);
  assert.equal(isFocusedPath(extensions, "/notes/writer"), false);
  assert.equal(isFocusedPath(extensions, "/notes"), false);
  assert.equal(isFocusedPath([notes], "/notes/write"), false);
});
