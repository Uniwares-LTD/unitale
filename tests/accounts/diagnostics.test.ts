import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, createCipheriv, randomBytes } from "node:crypto";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { UserRecord } from "firebase-admin/auth";
import { parseDiagnosticsConfig } from "../../src/lib/config/diagnostics";
import {
  diagnosticCapabilities,
  diagnosticCapabilityNames,
  MAX_ACTIVE_GRANTS,
  grantDurations,
  grantCreateSchema,
} from "../../src/lib/contracts/diagnostics";
import {
  appointFirstAdmin,
  changeAccess,
} from "../../src/lib/server/store/access";
import {
  mongoGrantStore,
  createGrantIndexes,
} from "../../src/lib/server/diagnostics/grant-store";
import type {
  GrantRecord,
  GrantStore,
} from "../../src/lib/server/diagnostics/grant-store";
import {
  createGrant as issueGeneratedGrant,
  listGrants,
  revokeGrant,
} from "../../src/lib/server/diagnostics/grants";
import {
  handleDiagnostics,
  type DiagnosticsDependencies,
} from "../../src/lib/server/diagnostics/handler";
import { registry } from "../../src/lib/server/diagnostics/registry";
import {
  define,
  type CapabilityDefinition,
} from "../../src/lib/server/diagnostics/context";
import {
  readCursor,
  signCursor,
} from "../../src/lib/server/diagnostics/cursor";
import {
  capabilityForRun,
  inspectPrivateContextConfiguration,
  inspectStoredCapability,
} from "../../src/lib/server/runs/capabilities";
import { AppError } from "../../src/lib/auth-policy";
import { z } from "zod";

/**
 * Fault-injecting grant store for lifecycle and transport tests.
 * Durable MongoDB and Redis limiters are exercised separately.
 */
function memoryStore(clock: () => number) {
  const grants = new Map<string, GrantRecord>();
  const counters = new Map<string, number>();
  let down = false;
  let failCreate = false;
  let failRevoke = false;
  const guard = () => {
    if (down) throw new Error("redis down");
  };
  const store: GrantStore & {
    setDown(value: boolean): void;
    setFailCreate(value: boolean): void;
    setFailRevoke(value: boolean): void;
    evict(id: string): void;
    resetCounters(): void;
  } = {
    async create(grant, limit, now) {
      guard();
      if (failCreate) throw new Error("create timed out");
      const active = [...grants.values()].filter(
        (g) => g.issuerUid === grant.issuerUid && g.expiresAt > now,
      );
      if (active.length >= limit) return "limit";
      if (grants.has(grant.id)) return "exists";
      grants.set(grant.id, structuredClone(grant));
      return "created";
    },
    async get(id, now) {
      guard();
      const grant = grants.get(id);
      return grant && grant.expiresAt > now ? structuredClone(grant) : null;
    },
    async list(uid, now) {
      guard();
      return [...grants.values()].filter(
        (g) => g.issuerUid === uid && g.expiresAt > now,
      );
    },
    async revoke(uid, id) {
      guard();
      if (failRevoke) throw new Error("revoke timed out");
      const grant = grants.get(id);
      if (!grant || grant.issuerUid !== uid) return false;
      grants.delete(id);
      return true;
    },
    async hit(bucket) {
      guard();
      const key = bucket.kind === "global" ? "global" : `grant:${bucket.id}`;
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      return { count, retryAfter: 60 };
    },
    setDown: (value) => {
      down = value;
    },
    setFailCreate: (value) => {
      failCreate = value;
    },
    setFailRevoke: (value) => {
      failRevoke = value;
    },
    evict: (id) => grants.delete(id),
    resetCounters: () => counters.clear(),
  };
  void clock;
  return store;
}
const user = (overrides: Partial<UserRecord> = {}) =>
  ({
    uid: "operator",
    email: "operator@example.test",
    emailVerified: true,
    disabled: false,
    providerData: [{ providerId: "password" }],
    metadata: { creationTime: new Date(0).toUTCString() },
    tokensValidAfterTime: new Date(0).toUTCString(),
    ...overrides,
  }) as unknown as UserRecord;

const PHRASE = "correct horse battery staple, diagnostics";
const SECRET_MARKERS = [
  "sk_live_SECRETVALUE123",
  "whsec_SECRETVALUE456",
  "capability-token-SECRET",
  "decision-token-SECRET",
  "https://checkout.example/SECRET",
  PHRASE,
];
const generatedCredentials = new Map<string, string>();
async function createGrant(...args: Parameters<typeof issueGeneratedGrant>) {
  const grant = await issueGeneratedGrant(...args);
  generatedCredentials.set(grant.id, grant.credential);
  return grant;
}
const credential = (id: string, phrase?: string) =>
  phrase === undefined
    ? `Bearer ${generatedCredentials.get(id)}`
    : `Bearer ${id}.${Buffer.from(phrase).toString("base64url")}`;
const post = (
  body: unknown,
  authorization: string | null,
  init: { method?: string; contentType?: string; raw?: BodyInit } = {},
) =>
  new Request("http://localhost/api/diagnostics", {
    method: init.method ?? "POST",
    headers: {
      ...(authorization ? { authorization } : {}),
      "content-type": init.contentType ?? "application/json",
    },
    ...((init.method ?? "POST") === "POST"
      ? { body: init.raw ?? JSON.stringify(body), duplex: "half" }
      : {}),
  } as RequestInit);

async function snapshot(db: Db) {
  const result: Record<string, string> = {};
  for (const { name } of await db.listCollections().toArray()) {
    // Only telemetry and audit collections may change during reads.
    if (["diagnosticAccess", "auditEvents"].includes(name)) continue;
    const rows = await db.collection(name).find().sort({ _id: 1 }).toArray();
    result[name] = createHash("sha256")
      .update(JSON.stringify(rows))
      .digest("hex");
  }
  return result;
}

test("diagnostics configuration is opt-in and never allowed in production", () => {
  assert.deepEqual(parseDiagnosticsConfig({}), { enabled: false });
  assert.deepEqual(parseDiagnosticsConfig({ DIAGNOSTICS_ENABLED: "false" }), {
    enabled: false,
  });
  assert.deepEqual(
    parseDiagnosticsConfig({ DIAGNOSTICS_ENABLED: "true", APP_ENV: "local" }),
    { enabled: true, environment: "local", redisUrl: null },
  );
  assert.throws(() =>
    parseDiagnosticsConfig({
      DIAGNOSTICS_ENABLED: "true",
      APP_ENV: "production",
      REDIS_URL: "redis://:pw@redis:6379",
    }),
  );
  assert.throws(() => parseDiagnosticsConfig({ DIAGNOSTICS_ENABLED: "yes" }));
});

test("cursors are bound to grant, capability, criteria and expiry", () => {
  const scope = {
    key: randomBytes(32),
    grantId: "g".repeat(22),
    capability: "run.search",
    criteria: { status: "failed" },
    grantExpiresAt: Date.now() + 60000,
    now: Date.now(),
  };
  const cursor = signCursor(scope, "2026-01-01T00:00:00.000Z", "abc");
  assert.deepEqual(readCursor(scope, cursor), {
    value: "2026-01-01T00:00:00.000Z",
    id: "abc",
  });
  const [body, mac] = cursor.split(".");
  const forged = Buffer.from(
    JSON.stringify({
      ...JSON.parse(Buffer.from(body, "base64url").toString()),
      i: "zzz",
    }),
  ).toString("base64url");
  for (const [variant, bad] of [
    ["tampered", `${forged}.${mac}`],
    ["other criteria", cursor],
    ["other capability", cursor],
    ["other key", cursor],
    ["expired", cursor],
  ] as const) {
    const changed =
      variant === "other criteria"
        ? { ...scope, criteria: { status: "succeeded" } }
        : variant === "other capability"
          ? { ...scope, capability: "run.get" }
          : variant === "other key"
            ? { ...scope, key: randomBytes(32) }
            : variant === "expired"
              ? { ...scope, now: scope.now + 2 * 3600 * 1000 }
              : scope;
    assert.throws(() => readCursor(changed, bad), { code: "INVALID_CURSOR" });
  }
});

test("private-context checks distinguish every cause without creating capabilities", async () => {
  const base = {
    APP_ORIGIN: "http://localhost:3000",
    MCP_ENABLED: "true",
    MCP_CLIENTS_JSON: JSON.stringify([
      { id: "dify", tokenEnv: "MCP_TOKEN_DIFY", permissions: ["run:read"] },
    ]),
    MCP_TOKEN_DIFY: randomBytes(32).toString("base64url"),
    DIFY_CREDENTIAL_ENCRYPTION_KEY: "a".repeat(64),
  };
  const reason = async (
    env: Record<string, string | undefined>,
    ops = ["get_run_context_v1"],
  ) => (await inspectPrivateContextConfiguration(ops, env)).reason;
  assert.equal(await reason(base), null);
  assert.equal(await reason({ ...base, MCP_ENABLED: "false" }), "mcp-disabled");
  assert.equal(
    await reason({ ...base, MCP_CLIENTS_JSON: "not json" }),
    "mcp-configuration-invalid",
  );
  // An explicitly selected but unconfigured client fails MCP validation.
  assert.equal(
    await reason({ ...base, RUN_MCP_CLIENT_ID: "other" }),
    "mcp-configuration-invalid",
  );
  assert.equal(
    await reason({
      ...base,
      MCP_CLIENTS_JSON: base.MCP_CLIENTS_JSON.replace('"dify"', '"other"'),
    }),
    "mcp-client-missing",
  );
  assert.equal(await reason(base, []), "private-tools-missing");
  assert.equal(
    await reason(base, ["save_artifact_draft_v1"]),
    "mcp-permissions-missing",
  );
  assert.equal(
    await reason({ ...base, DIFY_CREDENTIAL_ENCRYPTION_KEY: "xyz" }),
    "encryption-key-invalid",
  );
  assert.equal(
    await reason({ ...base, DIFY_CREDENTIAL_ENCRYPTION_KEY: undefined }),
    "encryption-key-missing",
  );
  const fallback = await inspectPrivateContextConfiguration(
    ["get_run_context_v1"],
    {
      ...base,
      DIFY_CREDENTIAL_ENCRYPTION_KEY: undefined,
      DIFY_MANAGEMENT_KEY: "management",
    },
  );
  assert.equal(fallback.keySource, "management-fallback");
  assert.equal(fallback.reason, null);
});

test("diagnostics: grants, authentication, capabilities and read-only evidence", async (t) => {
  const repl = await MongoMemoryReplSet.create({
    binary: { downloadDir: ".cache/mongodb-binaries" },
    replSet: { count: 1 },
  });
  const client = new MongoClient(repl.getUri());
  const db = client.db("diagnostics");
  let clock = Date.now();
  const now = () => clock;
  const store = memoryStore(now);
  const identities = new Map<string, UserRecord>([
    ["operator", user()],
    ["second", user({ uid: "second", email: "second@example.test" })],
    ["member-1", user({ uid: "member-1", email: "member@example.test" })],
  ]);
  const authTime = Math.floor(clock / 1000);
  const previousEnv = { ...process.env };
  try {
    await appointFirstAdmin(db, "operator", "fixture admin");
    await changeAccess(
      db,
      "operator",
      "second",
      { role: "admin", status: "active" },
      "fixture second admin",
    );
    const issuer = { uid: "operator", authTime };
    const all = [...diagnosticCapabilityNames];
    const deps = (
      overrides: Partial<DiagnosticsDependencies> = {},
    ): DiagnosticsDependencies => ({
      config: { enabled: true, environment: "local", redisUrl: "redis://x" },
      db: () => db,
      store: async () => store,
      identity: {
        getUser: async (uid) => identities.get(uid) ?? null,
        getUserByEmail: async (email) =>
          [...identities.values()].find((u) => u.email === email) ?? null,
      },
      redisPing: async () => {},
      registry,
      now,
      ...overrides,
    });
    const call = async (
      id: string,
      capability: string,
      payload: unknown = {},
      overrides: Partial<DiagnosticsDependencies> = {},
    ) => {
      const response = await handleDiagnostics(
        post({ capability, payload }, credential(id)),
        deps(overrides),
      );
      return {
        status: response.status,
        headers: response.headers,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON bodies are asserted field by field.
        body: (await response.json()) as Record<string, any>,
      };
    };

    await t.test(
      "grant creation is audited, bounded and never stores the phrase",
      async () => {
        await assert.rejects(
          createGrant({ db, store, now }, issuer, {
            phrase: "short",
            duration: "1h",
            capabilities: ["runtime.status"],
          }),
          { code: "INVALID_INPUT" },
        );
        const grant = await createGrant({ db, store, now }, issuer, {
          duration: "1h",
          capabilities: ["runtime.status"],
        });
        assert.equal(
          Date.parse(grant.expiresAt) - Date.parse(grant.issuedAt),
          3600000,
        );
        const events = await db
          .collection("auditEvents")
          .find({ reason: `grant:${grant.id}` })
          .sort({ timestamp: 1 })
          .toArray();
        assert.deepEqual(
          events.map((e) => e.event),
          ["diagnostic-grant-requested", "diagnostic-grant-activated"],
        );
        const stored = JSON.stringify(
          await db.collection("auditEvents").find().toArray(),
        );
        assert.ok(!stored.includes(PHRASE));
        assert.ok(!stored.includes("verifier"));
        assert.ok(!stored.includes(grant.credential));
        const secret = Buffer.from(grant.credential.split(".")[1], "base64url");
        assert.equal(secret.length, 32);
        assert.ok(
          !JSON.stringify(await store.get(grant.id, now())).includes(
            secret.toString("base64url"),
          ),
        );
        const listed = await listGrants({ store, now }, issuer);
        assert.ok(listed.grants.some((g) => g.id === grant.id));
        assert.ok(!JSON.stringify(listed).includes("salt"));
        assert.ok(!JSON.stringify(listed).includes("credential"));
        await revokeGrant({ db, store, now }, issuer, grant.id);
      },
    );

    await t.test(
      "store failure leaves no usable grant and a failed record",
      async () => {
        const input = {
          duration: "15m",
          capabilities: ["runtime.status"],
        };
        try {
          // Creation fails but removal is confirmed: an ordinary failure.
          store.setFailCreate(true);
          await assert.rejects(createGrant({ db, store, now }, issuer, input), {
            code: "DIAGNOSTICS_STORAGE_UNAVAILABLE",
          });
          // Removal cannot be confirmed: report and record uncertainty.
          store.setDown(true);
          await assert.rejects(createGrant({ db, store, now }, issuer, input), {
            code: "DIAGNOSTIC_GRANT_OUTCOME_UNKNOWN",
          });
        } finally {
          store.setFailCreate(false);
          store.setDown(false);
        }
        const failed = await db
          .collection("auditEvents")
          .find({ event: "diagnostic-grant-failed" })
          .toArray();
        assert.equal(failed.length, 2);
        assert.equal(
          failed.filter((e) => e.reason.endsWith(" outcome-uncertain")).length,
          1,
        );
        assert.equal(
          (await listGrants({ store, now }, issuer)).grants.length,
          0,
        );
      },
    );

    await t.test("at most twenty active grants per administrator", async () => {
      const results = await Promise.allSettled(
        Array.from({ length: MAX_ACTIVE_GRANTS + 2 }, () =>
          createGrant({ db, store, now }, issuer, {
            duration: "15m",
            capabilities: ["runtime.status"],
          }),
        ),
      );
      assert.equal(
        results.filter((r) => r.status === "fulfilled").length,
        MAX_ACTIVE_GRANTS,
      );
      assert.ok(
        results.some(
          (r) =>
            r.status === "rejected" &&
            (r.reason as AppError).code === "DIAGNOSTIC_GRANT_LIMIT",
        ),
      );
      for (const grant of (await listGrants({ store, now }, issuer)).grants)
        await revokeGrant({ db, store, now }, issuer, grant.id);
    });

    await t.test(
      "activation-audit failure reports withdrawal only when storage confirms it",
      async () => {
        const failingAudit = {
          collection: (name: string) =>
            name === "auditEvents"
              ? {
                  insertOne: async (doc: { event: string }) => {
                    if (doc.event === "diagnostic-grant-activated")
                      throw new Error("audit down");
                    return db.collection(name).insertOne(doc as never);
                  },
                }
              : db.collection(name),
          client: db.client,
        } as unknown as Db;
        const input = {
          duration: "15m",
          capabilities: ["runtime.status"],
        };
        await assert.rejects(
          createGrant({ db: failingAudit, store, now }, issuer, input),
          { code: "DIAGNOSTIC_GRANT_UNCERTAIN" },
        );
        assert.equal(
          (await listGrants({ store, now }, issuer)).grants.length,
          0,
        );
        try {
          store.setFailRevoke(true);
          await assert.rejects(
            createGrant({ db: failingAudit, store, now }, issuer, input),
            { code: "DIAGNOSTIC_GRANT_OUTCOME_UNKNOWN" },
          );
        } finally {
          store.setFailRevoke(false);
        }
        // The grant really may still exist, so the administrator can revoke it.
        const left = (await listGrants({ store, now }, issuer)).grants;
        assert.equal(left.length, 1);
        await revokeGrant({ db, store, now }, issuer, left[0].id);
      },
    );

    await t.test(
      "MongoDB grants survive store/limiter replacement and enforce scope, limits and expiry",
      async () => {
        await createGrantIndexes(db);
        const scope = "fixture:local:diagnostics";
        const fresh = () => mongoGrantStore(db, scope, memoryStore(now));
        const durable = fresh();
        const issued = [];
        for (const [duration, seconds] of Object.entries(grantDurations)) {
          const created = await createGrant(
            { db, store: durable, now },
            issuer,
            { duration, capabilities: ["capabilities.list"] },
          );
          issued.push(created);
          assert.equal(Date.parse(created.expiresAt) - now(), seconds * 1000);
          assert.ok(await fresh().get(created.id, now()));
          assert.equal(
            await fresh().get(created.id, Date.parse(created.expiresAt)),
            null,
          );
          assert.equal(
            await mongoGrantStore(
              db,
              "fixture:staging:diagnostics",
              memoryStore(now),
            ).get(created.id, now()),
            null,
          );
          assert.equal(await durable.revoke("other-issuer", created.id), false);
          const row = await db
            .collection("diagnosticGrants")
            .findOne({ id: created.id });
          assert.ok(row?.expiresAt instanceof Date);
          assert.ok(!JSON.stringify(row).includes(created.credential));
          const response = await handleDiagnostics(
            post(
              { capability: "capabilities.list", payload: {} },
              `Bearer ${created.credential}`,
            ),
            deps({ store: async () => fresh() }),
          );
          assert.equal(response.status, 200);
        }
        assert.equal(
          grantCreateSchema.safeParse({
            duration: "31d",
            capabilities: ["runtime.status"],
          }).success,
          false,
        );
        for (const created of issued) {
          await revokeGrant({ db, store: fresh(), now }, issuer, created.id);
          assert.equal(await fresh().get(created.id, now()), null);
          const response = await handleDiagnostics(
            post(
              { capability: "capabilities.list", payload: {} },
              `Bearer ${created.credential}`,
            ),
            deps({ store: async () => fresh() }),
          );
          assert.equal(response.status, 401);
        }
        const closedClient = new MongoClient(repl.getUri());
        await closedClient.close();
        const unavailable = mongoGrantStore(
          closedClient.db(db.databaseName),
          scope,
          memoryStore(now),
        );
        const unavailableResponse = await handleDiagnostics(
          post(
            { capability: "capabilities.list", payload: {} },
            `Bearer ${issued[0].credential}`,
          ),
          deps({ store: async () => unavailable }),
        );
        assert.equal(unavailableResponse.status, 503);
        await assert.rejects(listGrants({ store: unavailable, now }, issuer), {
          code: "DIAGNOSTICS_STORAGE_UNAVAILABLE",
        });
        const results = await Promise.allSettled(
          Array.from({ length: MAX_ACTIVE_GRANTS + 4 }, () =>
            createGrant({ db, store: fresh(), now }, issuer, {
              duration: "30d",
              capabilities: ["runtime.status"],
            }),
          ),
        );
        assert.equal(
          results.filter((r) => r.status === "fulfilled").length,
          MAX_ACTIVE_GRANTS,
        );
        for (const result of results)
          if (result.status === "rejected")
            assert.equal(
              (result.reason as AppError).code,
              "DIAGNOSTIC_GRANT_LIMIT",
            );
        assert.equal(
          (await durable.list(issuer.uid, now())).length,
          MAX_ACTIVE_GRANTS,
        );
        for (const created of await durable.list(issuer.uid, now()))
          await durable.revoke(issuer.uid, created.id);
        const broken = mongoGrantStore(db, scope, {
          hit: async () => {
            throw new Error("Redis unavailable");
          },
        });
        const created = await createGrant({ db, store: durable, now }, issuer, {
          duration: "1h",
          capabilities: ["capabilities.list"],
        });
        const response = await handleDiagnostics(
          post(
            { capability: "capabilities.list", payload: {} },
            `Bearer ${created.credential}`,
          ),
          deps({ store: async () => broken }),
        );
        assert.equal(response.status, 503);
        await durable.revoke(issuer.uid, created.id);
      },
    );

    const grant = await createGrant({ db, store, now }, issuer, {
      duration: "4h",
      capabilities: all.filter((c) => diagnosticCapabilities[c] === "metadata"),
    });

    await t.test(
      "transport boundaries: disabled, method, body and schema",
      async () => {
        const disabled = await handleDiagnostics(
          post(
            { capability: "runtime.status", payload: {} },
            credential(grant.id),
          ),
          deps({ config: { enabled: false } }),
        );
        assert.equal(disabled.status, 404);
        const get = await handleDiagnostics(
          post(null, credential(grant.id), { method: "GET" }),
          deps(),
        );
        assert.equal(get.status, 405);
        assert.equal(get.headers.get("allow"), "POST");
        const noRedis = await handleDiagnostics(
          post(
            { capability: "runtime.status", payload: {} },
            credential(grant.id),
          ),
          deps({
            config: { enabled: true, environment: "local", redisUrl: null },
          }),
        );
        assert.equal(noRedis.status, 503);
        const chunks = new ReadableStream({
          start(controller) {
            for (let i = 0; i < 20; i++)
              controller.enqueue(new TextEncoder().encode("x".repeat(1024)));
            controller.close();
          },
        });
        const large = await handleDiagnostics(
          post(null, credential(grant.id), { raw: chunks }),
          deps(),
        );
        assert.equal(large.status, 413);
        for (const body of [
          { capability: "runtime.status", payload: {}, extra: true },
          { capability: "runtime.status" },
          { capability: "runtime.status", payload: { unexpected: 1 } },
          { capability: "run.search", payload: { status: { $ne: "x" } } },
        ]) {
          const response = await handleDiagnostics(
            post(body, credential(grant.id)),
            deps(),
          );
          assert.equal(response.status, 400, JSON.stringify(body));
        }
        const unknown = await call(grant.id, "collections.drop");
        assert.equal(unknown.body.error.code, "UNKNOWN_CAPABILITY");
        const content = await call(grant.id, "run.content", { id: "x" });
        assert.equal(content.status, 403);
        assert.equal(content.body.error.code, "CAPABILITY_NOT_GRANTED");
        const legacyGrant = await createGrant({ db, store, now }, issuer, {
          duration: "15m",
          capabilities: ["runtime.status"],
        });
        const dataStatus = await call(
          legacyGrant.id,
          "data-operations.status",
          {},
        );
        assert.equal(dataStatus.status, 403);
        assert.equal(dataStatus.body.error.code, "CAPABILITY_NOT_GRANTED");
      },
    );

    await t.test(
      "authentication rejects wrong phrases, expiry, eviction and outages",
      async () => {
        store.resetCounters();
        const wrong = await handleDiagnostics(
          post(
            { capability: "runtime.status", payload: {} },
            credential(grant.id, "x".repeat(32)),
          ),
          deps(),
        );
        assert.equal(wrong.status, 401);
        for (const header of [
          null,
          "Basic abc",
          `Bearer ${grant.id}`,
          `Bearer ${"a".repeat(22)}.${Buffer.from(PHRASE).toString("base64url")}`,
        ]) {
          const response = await handleDiagnostics(
            post({ capability: "runtime.status", payload: {} }, header),
            deps(),
          );
          assert.equal(response.status, 401);
        }
        const short = await createGrant({ db, store, now }, issuer, {
          duration: "15m",
          capabilities: ["runtime.status"],
        });
        clock += 16 * 60 * 1000;
        assert.equal((await call(short.id, "runtime.status")).status, 401);
        clock -= 16 * 60 * 1000;
        const evicted = await createGrant({ db, store, now }, issuer, {
          duration: "15m",
          capabilities: ["runtime.status"],
        });
        store.evict(evicted.id);
        assert.equal((await call(evicted.id, "runtime.status")).status, 401);
        store.setDown(true);
        assert.equal((await call(grant.id, "runtime.status")).status, 503);
        store.setDown(false);
        const revocable = await createGrant({ db, store, now }, issuer, {
          duration: "15m",
          capabilities: ["runtime.status"],
        });
        assert.equal((await call(revocable.id, "runtime.status")).status, 200);
        await revokeGrant({ db, store, now }, issuer, revocable.id);
        assert.equal((await call(revocable.id, "runtime.status")).status, 401);
      },
    );

    await t.test(
      "identity and role changes invalidate existing grants",
      async () => {
        store.resetCounters();
        identities.set("operator", user({ disabled: true }));
        assert.equal((await call(grant.id, "runtime.status")).status, 401);
        identities.set("operator", user({ emailVerified: false }));
        assert.equal((await call(grant.id, "runtime.status")).status, 401);
        identities.set(
          "operator",
          user({ tokensValidAfterTime: new Date(clock + 1000).toUTCString() }),
        );
        assert.equal((await call(grant.id, "runtime.status")).status, 401);
        identities.set("operator", user());
        assert.equal((await call(grant.id, "runtime.status")).status, 200);

        const second = { uid: "second", authTime };
        const secondGrant = await createGrant({ db, store, now }, second, {
          duration: "1h",
          capabilities: ["runtime.status"],
        });
        assert.equal(
          (await call(secondGrant.id, "runtime.status")).status,
          200,
        );
        await changeAccess(
          db,
          "operator",
          "second",
          { role: "member", status: "active" },
          "demote",
        );
        assert.equal(
          (await call(secondGrant.id, "runtime.status")).status,
          401,
        );
        await changeAccess(
          db,
          "operator",
          "second",
          { role: "admin", status: "active" },
          "promote again",
        );
        // Re-promotion bumps the revision; the old grant stays dead.
        assert.equal(
          (await call(secondGrant.id, "runtime.status")).status,
          401,
        );
      },
    );

    await t.test("pre-authentication and per-grant limits", async () => {
      store.resetCounters();
      let last = 0;
      for (let i = 0; i < 31; i++)
        last = (await call(grant.id, "capabilities.list")).status;
      assert.equal(last, 429);
      store.resetCounters();
      for (let i = 0; i < 121; i++)
        last = (
          await handleDiagnostics(
            post({ capability: "runtime.status", payload: {} }, "Bearer nope"),
            deps(),
          )
        ).status;
      assert.equal(last, 429);
      store.resetCounters();
    });

    // Business fixtures with credential-like values that must never leak.
    const jobId = "a".repeat(64);
    const legacyId = "b".repeat(64);
    const orchestrator = {
      id: "context-demo",
      name: "Context demo",
      description: "",
      order: 0,
      keyEnv: "DIFY_KEY_DEMO",
      enabled: true,
      inputs: [],
      pricing: null,
      privateTools: ["get_run_context_v1"],
      contextInput: true,
      contextInputName: "context",
    };
    const job = (id: string, logicalId: string, extra = {}) => ({
      _id: id,
      uid: "member-1",
      authTime,
      schemaVersion: 1,
      capability: "run",
      capabilityVersion: "1",
      binding: {
        name: "demo",
        revision: "1",
        kind: "workflow",
        mode: "fake",
        fingerprint: "f",
      },
      fingerprint: "f",
      inputs: { prompt: "hello", context: "capability-token-SECRET" },
      source: null,
      credits: 1,
      reservationId: "hold-1",
      status: "failed",
      runId: null,
      taskId: null,
      execution: null,
      lease: null,
      leaseUntil: new Date(clock),
      attempts: 1,
      nextAttemptAt: new Date(clock),
      reviewAfter: new Date(clock + 3600000),
      cancelRequested: false,
      failure: "private-context-unavailable",
      createdAt: new Date(clock - 1000),
      updatedAt: new Date(clock),
      run: {
        logicalId,
        attempt: 1,
        predecessorId: null,
        orchestrator,
        configurationRevision: 1,
        settingsRevision: 1,
        failureCharging: "success-only",
        concurrentPerAccount: 5,
        reconciliationHours: 24,
        retryBaseSeconds: 2,
        retryMaxSeconds: 300,
        pollSeconds: 5,
        imageBytes: 1,
        imagePixels: 1,
      },
      ...extra,
    });
    await db.collection("aiJobs").insertMany([
      job(jobId, "logical-1", {
        failureDetail: {
          reason: "mcp-permissions-missing",
          at: new Date(clock),
        },
      }),
      job(legacyId, "logical-2"),
    ] as never[]);
    await db.collection("runDecisions").insertOne({
      _id: "decision-1",
      uid: "member-1",
      logicalId: "logical-1",
      jobId,
      nodeId: "n",
      title: "Approve",
      token: "decision-token-SECRET",
      status: "submitted",
      createdAt: new Date(clock),
    } as never);
    await db.collection("creditWallets").insertOne({
      _id: "member-1",
      balance: 10,
      reserved: 1,
      debt: 0,
      sequence: 2,
      revision: 2,
      updatedAt: new Date(clock),
    } as never);
    await db.collection("creditLots").insertOne({
      _id: "lot-expired",
      uid: "member-1",
      source: "promotion",
      reference: "r",
      originalCredits: 10,
      reversedCredits: 0,
      remaining: 10,
      reserved: 0,
      expiresAt: new Date(clock - 86400000),
      createdAt: new Date(clock - 2 * 86400000),
    } as never);
    await db.collection("creditReservations").insertOne({
      _id: "hold-1",
      uid: "member-1",
      amount: 1,
      allocations: [],
      status: "active",
      createdAt: new Date(clock - 1000),
      expiresAt: new Date(clock - 500),
    } as never);
    await db.collection("purchaseOrders").insertOne({
      _id: "order-1",
      uid: "member-1",
      provider: "stripe",
      packId: "p",
      label: "Pack",
      credits: 10,
      priceId: "price_1",
      amountMinor: 100,
      currency: "usd",
      origin: "http://localhost:3000",
      status: "paid",
      sessionId: "cs_1",
      checkoutUrl: "https://checkout.example/SECRET",
      granted: true,
      reversed: 0,
      revision: 1,
      leaseToken: "sk_live_SECRETVALUE123",
      createdAt: new Date(clock),
      updatedAt: new Date(clock),
    } as never);
    await db.collection("paymentInbox").insertOne({
      _id: "notice-1",
      provider: "stripe",
      type: "checkout.session.completed",
      objectId: "cs_1",
      status: "done",
      attempts: 1,
      nextAt: new Date(clock),
      createdAt: new Date(clock),
      body: "whsec_SECRETVALUE456",
    } as never);
    await db.collection("artifacts").insertOne({
      id: "artifact-1",
      uid: "member-1",
      title: "Story",
      revision: 1,
      approvedRevision: null,
      assets: [],
      createdAt: new Date(clock),
    } as never);
    await db.collection("artifactRevisions").insertOne({
      _id: "rev-1",
      artifactId: "artifact-1",
      uid: "member-1",
      revision: 1,
      text: "<script>alert(1)</script> saved text",
      contentHash: "h",
      jobId,
      logicalId: "logical-1",
      createdAt: new Date(clock),
    } as never);
    await db.collection("workerHeartbeats").insertOne({
      _id: "ai:instance",
      kind: "ai",
      state: "ok",
      commit: "local",
      updatedAt: new Date(clock),
      checks: {
        observedAt: new Date(clock),
        privateContext: {
          mcp: "enabled",
          clientId: "dify",
          clientConfigured: true,
          missingPermissions: ["run:read", "artifact:write"],
          keySource: "explicit",
          originConfigured: true,
        },
      },
    } as never);

    const contentGrant = await createGrant({ db, store, now }, issuer, {
      duration: "1h",
      capabilities: all,
    });

    await t.test(
      "run.diagnose separates recorded evidence from current checks",
      async () => {
        store.resetCounters();
        const recorded = await call(grant.id, "run.diagnose", {
          id: "logical-1",
        });
        assert.equal(recorded.status, 200, JSON.stringify(recorded.body));
        const data = recorded.body.data;
        assert.equal(data.failure.code, "private-context-unavailable");
        assert.equal(data.failure.historical.basis, "recorded");
        assert.equal(data.failure.historical.cause, "mcp-permissions-missing");
        assert.equal(data.privateContext.current.web.source, "web");
        assert.ok(data.privateContext.current.web.observedAt);
        assert.deepEqual(
          data.privateContext.current.workers[0].privateContext
            .missingPermissions,
          ["run:read"],
        );
        assert.equal(data.privateContext.storedCapability.present, false);
        const legacy = await call(grant.id, "run.diagnose", { id: legacyId });
        assert.equal(legacy.body.data.failure.historical.basis, "unrecorded");
        assert.equal(legacy.body.data.failure.historical.cause, null);
        const access = await db
          .collection("diagnosticAccess")
          .findOne({ requestId: recorded.body.requestId });
        assert.equal(access?.capability, "run.diagnose");
        assert.equal(access?.targets[0].accountUid, "member-1");
        assert.ok(!JSON.stringify(access).includes(PHRASE));
      },
    );

    await t.test(
      "every capability is read-only and never leaks credentials",
      async () => {
        store.resetCounters();
        const before = await snapshot(db);
        const payloads: Record<string, unknown> = {
          "reports.search": { kind: "audit" },
          "reports.get": { kind: "audit", id: "missing" },
          "run.search": { failure: "private-context-unavailable" },
          "run.get": { id: "logical-1" },
          "run.diagnose": { id: jobId },
          "run.content": { id: jobId },
          "account.search": { email: "member@example.test" },
          "account.get": { uid: "member-1" },
          "credits.get": { uid: "member-1" },
          "credits.ledger": { uid: "member-1" },
          "credits.holds": { uid: "member-1" },
          "payments.search": { uid: "member-1" },
          "payments.get": { id: "order-1" },
          "file.search": { uid: "member-1" },
          "file.get": { id: "missing" },
          "artifact.search": { uid: "member-1" },
          "artifact.get": { id: "artifact-1" },
          "artifact.revisions": { id: "artifact-1" },
          "artifact.content": { id: "artifact-1", revision: 1 },
          "notifications.search": { uid: "member-1" },
          "notifications.get": { id: "missing" },
          "orchestrator.search": {},
          "orchestrator.get": { id: "missing" },
          "persona.search": {},
          "persona.get": { id: "missing" },
        };
        for (const name of all) {
          const response = await call(
            contentGrant.id,
            name,
            payloads[name] ?? {},
          );
          assert.ok(
            [200, 404].includes(response.status),
            `${name}: ${response.status} ${JSON.stringify(response.body)}`,
          );
          const text = JSON.stringify(response.body);
          for (const marker of SECRET_MARKERS)
            assert.ok(!text.includes(marker), `${name} leaked ${marker}`);
          store.resetCounters();
        }
        assert.deepEqual(await snapshot(db), before);
        // Settings were read without seeding defaults.
        assert.equal(await db.collection("baseSettings").countDocuments(), 0);
        const accessText = JSON.stringify(
          await db.collection("diagnosticAccess").find().toArray(),
        );
        for (const marker of SECRET_MARKERS)
          assert.ok(!accessText.includes(marker));
      },
    );

    await t.test(
      "content is inert data and private context is omitted",
      async () => {
        const content = await call(contentGrant.id, "run.content", {
          id: jobId,
        });
        assert.equal(content.body.data.content.inputs.prompt, "hello");
        assert.equal(content.body.data.content.inputs.context, undefined);
        const artifact = await call(contentGrant.id, "artifact.content", {
          id: "artifact-1",
          revision: 1,
        });
        assert.equal(
          artifact.body.data.text,
          "<script>alert(1)</script> saved text",
        );
        assert.equal(
          artifact.headers.get("content-type"),
          "application/json; charset=utf-8",
        );
        const credits = await call(contentGrant.id, "credits.get", {
          uid: "member-1",
        });
        assert.equal(credits.body.data.lots[0].expiredPendingSettlement, true);
      },
    );

    await t.test(
      "pagination cursors are signed per grant and criteria",
      async () => {
        store.resetCounters();
        await db.collection("aiJobs").insertMany(
          Array.from({ length: 30 }, (_, i) =>
            job(`page-${String(i).padStart(3, "0")}`, `logical-page-${i}`, {
              createdAt: new Date(clock - 100000 + i),
            }),
          ) as never[],
        );
        const first = await call(grant.id, "run.search", {
          accountUid: "member-1",
        });
        assert.equal(first.body.data.rows.length, 25);
        const cursor = first.body.data.nextCursor;
        assert.ok(cursor);
        const second = await call(grant.id, "run.search", {
          accountUid: "member-1",
          cursor,
        });
        assert.equal(second.status, 200);
        assert.ok(second.body.data.rows.length > 0);
        const otherCriteria = await call(grant.id, "run.search", {
          accountUid: "member-2",
          cursor,
        });
        assert.equal(otherCriteria.body.error.code, "INVALID_CURSOR");
        const otherGrant = await call(contentGrant.id, "run.search", {
          accountUid: "member-1",
          cursor,
        });
        assert.equal(otherGrant.body.error.code, "INVALID_CURSOR");
      },
    );

    await t.test(
      "timeouts, oversized results and audit failure return no data",
      async () => {
        store.resetCounters();
        const slow = define({
          description: "slow",
          inputs: {},
          input: z.strictObject({}),
          run: () => new Promise(() => {}),
        });
        const huge = define({
          description: "huge",
          inputs: {},
          input: z.strictObject({}),
          run: async () => ({ text: "x".repeat(600 * 1024) }),
        });
        const testRegistry: Record<string, CapabilityDefinition> = {
          ...registry,
          "runtime.status": slow,
          "workers.status": huge,
        };
        const timeout = await call(
          grant.id,
          "runtime.status",
          {},
          {
            registry: testRegistry,
            deadlineMs: 2000,
          },
        );
        assert.equal(timeout.status, 504);
        const large = await call(
          grant.id,
          "workers.status",
          {},
          {
            registry: testRegistry,
          },
        );
        assert.equal(large.body.error.code, "DIAGNOSTICS_RESPONSE_TOO_LARGE");
        const failingDb = {
          collection: (name: string) =>
            name === "diagnosticAccess"
              ? {
                  insertOne: async () => {
                    throw new Error("audit down");
                  },
                }
              : db.collection(name),
          command: db.command.bind(db),
        } as unknown as Db;
        const audit = await call(
          grant.id,
          "capabilities.list",
          {},
          {
            db: () => failingDb,
          },
        );
        assert.equal(audit.status, 503);
        assert.equal(audit.body.error.code, "DIAGNOSTICS_AUDIT_UNAVAILABLE");
        assert.equal(audit.body.data, undefined);
      },
    );

    await t.test(
      "metadata omits decision answers and content redacts echoed capability tokens",
      async () => {
        store.resetCounters();
        const echoId = "e".repeat(64);
        const token = randomBytes(32).toString("base64url");
        await db
          .collection("aiJobs")
          .insertOne(job(echoId, "logical-echo") as never);
        await db.collection("runCapabilities").insertOne({
          _id: createHash("sha256").update(token).digest("hex"),
          jobId: echoId,
        } as never);
        await db.collection("runEvents").insertOne({
          _id: "event-filled",
          uid: "member-1",
          jobId: echoId,
          logicalId: "logical-echo",
          event: {
            type: "decision-filled",
            nodeId: "n",
            action: "approve",
            inputs: { answer: "private answer content" },
          },
          timestamp: new Date(clock),
        } as never);
        await db.collection("runDecisions").insertOne({
          _id: "decision-echo",
          uid: "member-1",
          logicalId: "logical-echo",
          jobId: echoId,
          nodeId: "n",
          title: "Review",
          token: "decision-token-SECRET",
          status: "pending",
          form: { resolved_default_values: { context: `ctx ${token} end` } },
          createdAt: new Date(clock),
        } as never);
        const metadata = await call(grant.id, "run.get", { id: echoId });
        assert.equal(metadata.status, 200);
        assert.ok(
          !JSON.stringify(metadata.body).includes("private answer content"),
        );
        assert.equal(metadata.body.data.transitions[0].event.action, "approve");
        const content = await call(contentGrant.id, "run.content", {
          id: echoId,
        });
        const text = JSON.stringify(content.body);
        assert.ok(!text.includes(token));
        assert.ok(text.includes("ctx [private-context] end"));
      },
    );

    await t.test(
      "Run metadata distinguishes applied saves from missing images without exposing bytes",
      async () => {
        store.resetCounters();
        await db.collection("aiJobs").updateOne({ _id: jobId } as never, {
          $set: {
            "run.target": {
              adapter: "artifact",
              version: "1",
              kind: "artifact",
              id: "artifact-1",
              privateField: "DO_NOT_EXPOSE_TARGET",
            },
          },
        });
        await db.collection("resultApplications").insertOne({
          _id: "application-meta",
          uid: "member-1",
          jobId,
          artifactId: "artifact-1",
          status: "applied",
          nextAttemptAt: new Date(clock),
          secret: "DO_NOT_EXPOSE_APPLICATION",
          lease: "DO_NOT_EXPOSE_LEASE",
          failure: {
            code: "ASSET_UNAVAILABLE",
            phase: "apply",
            at: new Date(clock),
            message: "DO_NOT_EXPOSE_FAILURE",
          },
        } as never);
        await db.collection("runAssets").insertMany([
          {
            _id: "owned-image",
            uid: "member-1",
            jobId,
            status: "ready",
            bytes: 123,
            base64: "DO_NOT_EXPOSE_IMAGE_BYTES",
            object: { key: "DO_NOT_EXPOSE_STORAGE" },
          },
          {
            _id: "foreign-image",
            uid: "other-member",
            jobId,
            status: "ready",
            bytes: 123,
          },
        ] as never);
        await db.collection("productAssets").insertOne({
          _id: "owned-product",
          uid: "member-1",
          jobId,
          state: "ready",
          references: ["artifact:artifact-1"],
          base64: "DO_NOT_EXPOSE_PRODUCT_BYTES",
        } as never);
        const before = await snapshot(db);
        const response = await call(grant.id, "run.get", { id: jobId });
        assert.equal(response.status, 200);
        const data = response.body.data;
        assert.equal(data.resultApplications[0].status, "applied");
        assert.deepEqual(data.attempts[0].target, {
          adapter: "artifact",
          version: "1",
          kind: "artifact",
          id: "artifact-1",
        });
        assert.equal(data.resultApplications[0].artifactId, "artifact-1");
        assert.deepEqual(data.resultApplications[0].failure, {
          code: "ASSET_UNAVAILABLE",
          phase: "apply",
          at: new Date(clock).toISOString(),
        });
        assert.deepEqual(data.assets, [
          {
            id: "owned-image",
            attemptId: jobId,
            status: "ready",
            bytes: 123,
            retained: false,
          },
        ]);
        assert.deepEqual(data.productAssets, [
          {
            id: "owned-product",
            attemptId: jobId,
            state: "ready",
            references: ["artifact:artifact-1"],
            referencesTruncated: false,
          },
        ]);
        assert.equal(data.resultMetadataTruncated, false);
        assert.ok(!JSON.stringify(data).includes("DO_NOT_EXPOSE"));
        assert.ok(!JSON.stringify(data).includes("foreign-image"));
        assert.deepEqual(await snapshot(db), before);
        await db.collection("runAssets").insertMany(
          Array.from({ length: 251 }, (_, i) => ({
            _id: `extra-meta-${i}`,
            uid: "member-1",
            jobId,
            status: "staged",
            bytes: 1,
            base64: "DO_NOT_EXPOSE_EXTRA_BYTES",
          })) as never,
        );
        const limited = await call(grant.id, "run.get", { id: jobId });
        assert.equal(limited.status, 200);
        assert.equal(limited.body.data.assets.length, 250);
        assert.equal(limited.body.data.resultMetadataTruncated, true);
        assert.ok(!JSON.stringify(limited.body).includes("DO_NOT_EXPOSE"));
      },
    );

    await t.test(
      "one deadline from request entry bounds authentication",
      async () => {
        store.resetCounters();
        const started = Date.now();
        const response = await call(
          grant.id,
          "runtime.status",
          {},
          {
            now: Date.now,
            deadlineMs: 2000,
            identity: {
              getUser: () => new Promise(() => {}),
              getUserByEmail: async () => null,
            },
          },
        );
        assert.equal(response.status, 504);
        assert.equal(response.body.error.code, "DIAGNOSTICS_TIMEOUT");
        assert.ok(Date.now() - started < 2500, "stalled identity check");
      },
    );

    await t.test(
      "run.content pages decisions with an explicit continuation",
      async () => {
        store.resetCounters();
        const manyId = "d".repeat(64);
        await db
          .collection("aiJobs")
          .insertOne(job(manyId, "logical-many") as never);
        await db.collection("runDecisions").insertMany(
          Array.from({ length: 51 }, (_, i) => ({
            _id: `many-${String(i).padStart(3, "0")}`,
            uid: "member-1",
            logicalId: "logical-many",
            jobId: manyId,
            nodeId: `n${i}`,
            title: `Decision ${i}`,
            status: "submitted",
            // Equal timestamps exercise the _id tie-breaker.
            createdAt: new Date(clock + Math.floor(i / 10)),
          })) as never[],
        );
        const seen: string[] = [];
        let cursor: string | undefined;
        let pages = 0;
        do {
          const page = await call(contentGrant.id, "run.content", {
            id: manyId,
            ...(cursor ? { cursor } : {}),
          });
          assert.equal(page.status, 200, JSON.stringify(page.body));
          const data = page.body.data;
          seen.push(
            ...data.content.decisions.map((d: { _id: string }) => d._id),
          );
          assert.equal(
            data.decisions.complete,
            data.decisions.nextCursor === null,
          );
          if (pages === 0) assert.equal(data.decisions.complete, false);
          else assert.equal(data.content.inputs, undefined);
          cursor = data.decisions.nextCursor ?? undefined;
          pages++;
          store.resetCounters();
        } while (cursor && pages < 5);
        assert.equal(pages, 3);
        assert.equal(seen.length, 51);
        assert.equal(new Set(seen).size, 51);
      },
    );

    await t.test(
      "saved context decryption failure is reported without plaintext",
      async () => {
        process.env.DIFY_CREDENTIAL_ENCRYPTION_KEY = "b".repeat(64);
        process.env.APP_ORIGIN = "http://localhost:3000";
        const token = "capability-token-SECRET";
        // Encrypt with a different origin salt to simulate a changed APP_ORIGIN.
        const { hkdfSync } = await import("node:crypto");
        const key = Buffer.from(
          hkdfSync(
            "sha256",
            Buffer.from("b".repeat(64), "hex"),
            "http://old-origin",
            "unibase:run-capabilities:v1",
            32,
          ),
        );
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", key, iv);
        cipher.setAAD(Buffer.from(legacyId));
        const ciphertext = Buffer.concat([
          cipher.update(token),
          cipher.final(),
        ]);
        await db.collection("runCapabilities").insertOne({
          _id: "c".repeat(64),
          jobId: legacyId,
          uid: "member-1",
          clientId: "dify",
          operations: ["get_run_context_v1"],
          expiresAt: new Date(clock + 3600000),
          ciphertext: ciphertext.toString("base64"),
          iv: iv.toString("base64"),
          tag: cipher.getAuthTag().toString("base64"),
        } as never);
        const check = await inspectStoredCapability(db, legacyId);
        assert.deepEqual(
          {
            present: check.present,
            decryption: check.present && check.decryption,
          },
          { present: true, decryption: "decryption-failed" },
        );
        assert.ok(!JSON.stringify(check).includes(token));
        await assert.rejects(
          capabilityForRun(
            db,
            (await db
              .collection<{ _id: string }>("aiJobs")
              .findOne({ _id: legacyId })) as never,
          ),
          (error: unknown) =>
            error instanceof AppError &&
            error.code === "CAPABILITY_CONFIGURATION" &&
            error.reason === "decryption-failed",
        );
        const response = await call(grant.id, "run.diagnose", { id: legacyId });
        assert.equal(
          response.body.data.privateContext.storedCapability.decryption,
          "decryption-failed",
        );
        assert.ok(!JSON.stringify(response.body).includes(token));
        assert.ok(
          !JSON.stringify(response.body).includes(
            ciphertext.toString("base64"),
          ),
        );
      },
    );
  } finally {
    process.env = previousEnv;
    await client.close();
    await repl.stop();
  }
});

// The Lua-backed store needs a disposable Redis (e.g. the docker fixture used
// by scripts/test-rate-limits.mjs). Never point this at shared infrastructure.
test(
  "Redis diagnostic limiter shares counters and fails closed",
  {
    skip:
      !process.env.DIAGNOSTICS_TEST_REDIS_URL &&
      "DIAGNOSTICS_TEST_REDIS_URL not set",
  },
  async () => {
    const { createClient } = await import("redis");
    const { redisGrantLimiter } =
      await import("../../src/lib/server/diagnostics/grant-store");
    const client = createClient({
      url: process.env.DIAGNOSTICS_TEST_REDIS_URL,
    });
    await client.connect();
    const prefix = `test:${randomBytes(8).toString("hex")}:diagnostics`;
    try {
      const first = redisGrantLimiter(client, prefix);
      const second = redisGrantLimiter(client, prefix);
      assert.equal((await first.hit({ kind: "global" })).count, 1);
      assert.equal((await second.hit({ kind: "global" })).count, 2);
      assert.equal((await first.hit({ kind: "grant", id: "one" })).count, 1);
      assert.equal((await second.hit({ kind: "grant", id: "two" })).count, 1);
    } finally {
      for (const key of await client.keys(`${prefix}:*`)) await client.del(key);
      await client.quit();
    }
    await assert.rejects(
      redisGrantLimiter(client, prefix).hit({ kind: "global" }),
    );
  },
);
