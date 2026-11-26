// Scripted local Manager for viewing the booklet conversation in the owned
// browser fixture (no Dify). It stands in for the Dify Manager only: every turn
// goes through the real repository `requestHuman` (target and image binding) and
// the native Run decision path, exactly where the Manager's Human Input would.
// The script, its questions and its order are illustrative, not product flow.
// Usage (fixture running and seeded by booklet-fixture-seed.ts):
//   node --conditions=react-server --import tsx
//     tests/integration/booklet-chat-manager.ts <mongodb-uri>
// It only accepts loopback URIs and the fixture's database prefix.
import { createHash, randomUUID } from "node:crypto";
import { demoStory } from "./booklet-demo-story";
import { readFile } from "node:fs/promises";
import { Binary, MongoClient, type Db } from "mongodb";
import { fixtureDatabasePrefix } from "./project-fixture.mjs";
import { bookletLifecycleV2 } from "../../src/lib/server/booklets/lifecycle-v2";
import { bookletRepositoryV2 } from "../../src/lib/server/booklets/repository-v2";
import { persistAiEvent, type AiJob } from "../../src/lib/server/ai/jobs";
import { fingerprint } from "../../src/lib/server/foundation/canonical";
import type { ProductionV2 } from "../../src/lib/server/booklets/documents-v2";
import type { Decision } from "../../src/lib/server/runs/service";
import {
  bookletReplySchema,
  type BookletReply,
  type BookletTurn,
} from "../../src/project/booklets/turn-contract";

const uri = process.argv[2] ?? "";
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri))
  throw new Error("Pass the fixture's loopback MongoDB URI.");
const lease = "local-scripted-manager";
const illustratedDemo = process.env.UNITALE_DEMO_STORYBOOK === "1";
// Local preview switches, both off by default so existing tests keep their timing.
// UNITALE_FAKE_PACE_MS: walk the book's work through each stage for this long.
// UNITALE_FAKE_REPLY=short|long: trim replies to one sentence or add a paragraph.
const pace = Math.max(0, Number(process.env.UNITALE_FAKE_PACE_MS) || 0);
const replyLength = process.env.UNITALE_FAKE_REPLY;
const stages = [
  "story-planner",
  "art-director",
  "page-composer",
  "image-executor",
  "quality-reviewer",
];
type Step =
  | "revision"
  | "audience"
  | "age"
  | "themes"
  | "story"
  | "production"
  | "artwork"
  | "done";
type State = {
  _id: string;
  step: Step;
  requestId: string | null;
  answers: Record<string, string>;
  outline: number;
  producingSince?: Date;
  jobId?: string;
  revisionCategory?: string;
};

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const names = (await client.db().admin().listDatabases()).databases
    .map((d) => d.name)
    .filter((name) => name.startsWith(fixtureDatabasePrefix));
  if (names.length !== 1) throw new Error("Expected one fixture database.");
  const db = client.db(names[0]);
  console.log("Scripted local Manager watching " + names[0]);
  for (;;) {
    try {
      if (illustratedDemo) {
        const jobs = await db
          .collection<AiJob>("aiJobs")
          .find({
            "run.target.adapter": "booklet",
            "run.target.version": "2",
            status: { $in: ["queued", "dispatching", "running", "paused"] },
          })
          .sort({ createdAt: 1 })
          .limit(50)
          .toArray();
        for (const job of jobs) await tick(db, job);
      } else await tick(db);
    } catch (error) {
      console.error(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function tick(db: Db, selected?: AiJob) {
  const job =
    selected ??
    (await db.collection<AiJob>("aiJobs").findOne(
      {
        "run.target.adapter": "booklet",
        "run.target.version": "2",
        status: { $in: ["queued", "dispatching", "running", "paused"] },
      },
      { sort: { createdAt: -1 } },
    ));
  if (!job) return;
  const productionId = job.run!.target!.id;
  const states = db.collection<State>("localScriptedManager");
  let state = await states.findOne({ _id: productionId });
  const now = new Date();
  // Take the attempt over from the fake provider: a long local lease keeps the
  // worker away, and the active flow names this attempt, as at dispatch.
  if (
    job.lease !== lease ||
    (job.leaseUntil ?? now) <= new Date(now.getTime() + 600000)
  ) {
    await db.collection<AiJob>("aiJobs").updateOne(
      { _id: job._id },
      {
        $set: {
          status: "paused",
          lease,
          leaseUntil: new Date(now.getTime() + 3600000),
          runId: job.runId ?? randomUUID(),
          taskId: job.taskId ?? randomUUID(),
          nextAttemptAt: new Date(now.getTime() + 3600000),
          updatedAt: now,
        },
        $unset: { execution: "" },
      },
    );
    await db
      .collection("consumptionWorkflows")
      .updateOne(
        { _id: job.consumption!.workflowId as never },
        { $set: { jobId: job._id } },
      );
  }
  const current = (await db
    .collection<AiJob>("aiJobs")
    .findOne({ _id: job._id }))!;
  const actor = { uid: current.uid, authTime: Math.floor(Date.now() / 1000) };
  const repo = bookletRepositoryV2(db, actor);
  if (
    illustratedDemo &&
    state?.step === "done" &&
    state.jobId !== current._id
  ) {
    const production = await repo.getProduction(productionId);
    const allocation = await db
      .collection("consumptionAllocations")
      .findOne({ chargeId: production.revisionChargeId });
    if (!allocation)
      throw new Error("Demo revision must have an approved allocation.");
    await states.updateOne(
      { _id: productionId },
      {
        $set: {
          step: "revision",
          requestId: null,
          jobId: current._id,
          revisionCategory: allocation.category,
        },
      },
    );
    state = await states.findOne({ _id: productionId });
  }
  if (!state) {
    state = {
      _id: productionId,
      step: "audience",
      requestId: null,
      answers: {},
      outline: 0,
      jobId: current._id,
    };
    await states.insertOne(state);
  }
  if (state.step === "done") return;
  let reply: BookletReply | null = null;
  if (state.requestId) {
    const receipt = await db.collection("bookletRepositoryWrites").findOne({
      productionId,
      "result.humanRequest.requestId": state.requestId,
    });
    const form =
      receipt!.result.humanRequest.formContent + "\n{{#$output.response#}}";
    const decision = await db.collection<Decision>("runDecisions").findOne({
      jobId: current._id,
      nodeId: "human",
      "form.form_content": form,
    });
    if (decision?.status !== "submitted") return;
    reply = bookletReplySchema.parse(decision.intent!.response);
  }

  // A fresh short production lease for each write group, held by the attempt.
  let p = await repo.getProduction(productionId);
  if (
    !p.mutationLease ||
    p.mutationLease.expiresAt <= now ||
    p.mutationLease.holderId !== current._id
  ) {
    await repo.acquireLease(productionId, {
      key: "local-lease-" + randomUUID(),
      holderId: current._id,
      expectedVersion: p.version,
      durationMs: 300000,
    });
    p = await repo.getProduction(productionId);
  }
  const mutation = () => ({
    key: "local-" + randomUUID(),
    expectedVersion: p.version,
    holderId: current._id,
    fence: p.mutationLease!.fence,
  });
  const write = async <T extends { version: number }>(effect: Promise<T>) => {
    const result = await effect;
    p = await repo.getProduction(productionId);
    return result;
  };
  const answer = (r: BookletReply | null, labels: Record<string, string>) =>
    r?.kind === "answer"
      ? [
          ...r.choices.map((c) => labels[c] ?? c),
          ...(r.text ? [r.text] : []),
        ].join(", ")
      : "";

  let next: Step = state.step;
  let turn: BookletTurn;
  let targets: {
    artifactId: string;
    revisionId: string;
    contentHash: string;
  }[] = [];
  const demo = illustratedDemo ? demoStory(p.brief.language.tag) : null;
  const ar = illustratedDemo && p.brief.language.tag === "ar";
  const copy = (en: string, arabic: string) => (ar ? arabic : en);
  const audience = {
    child: copy("My child", "طفلي"),
    friend: copy("A friend's child", "طفل صديق"),
    group: copy("A class or group", "فصل أو مجموعة"),
  };
  const ages = {
    a2: "2–3",
    a4: "4–5",
    a6: "6–7",
    a8: copy("8 or older", "٨ سنوات أو أكثر"),
  };
  const themes = {
    kind: copy("Kindness", "اللطف"),
    brave: copy("Courage", "الشجاعة"),
    curious: copy("Curiosity", "الفضول"),
    friends: copy("Friendship", "الصداقة"),
  };
  if (state.step === "revision") {
    // The real allocation/quote owns scope and credits. The offline preview can
    // collect feedback, but must not manufacture an out-of-scope creative result.
    if (reply?.kind === "answer") state.answers.changes = reply.text;
    turn = {
      version: 1,
      parts: [
        {
          type: "prose",
          text: copy(
            "This is the prepared local demo. Revision pricing and consent use the real application rules; no live rewriting or illustration generation runs here. Your feedback is saved in this conversation. The existing finished book stays available.",
            "هذه تجربة محلية مُعدّة مسبقًا. الأسعار والموافقة تتبع قواعد التطبيق؛ لا تتم إعادة كتابة القصة أو إنشاء رسوم مباشرة هنا. تُحفظ ملاحظاتك في المحادثة ويبقى الكتاب الحالي متاحًا.",
          ),
        },
        {
          type: "question",
          kind: "text",
          prompt: copy(
            "What would you like to change?",
            "ما التغييرات التي ترغب بها؟",
          ),
          freeText: true,
          options: [],
        },
      ],
    };
  } else if (state.step === "audience" && !reply) {
    turn = {
      version: 1,
      parts: [
        {
          type: "prose",
          text:
            demo?.notice ??
            "What a lovely idea! Let's shape it together. A few quick questions first.",
        },
        {
          type: "question",
          kind: "single",
          prompt: copy("Who is this book for?", "لمن هذا الكتاب؟"),
          freeText: true,
          options: Object.entries(audience).map(([id, label]) => ({
            id,
            label,
          })),
        },
      ],
    };
  } else if (state.step === "audience") {
    state.answers.audience = answer(reply, audience);
    next = "age";
    turn = {
      version: 1,
      parts: [
        {
          type: "question",
          kind: "single",
          prompt: copy("How old are they?", "كم عمر الطفل؟"),
          freeText: true,
          options: Object.entries(ages).map(([id, label]) => ({ id, label })),
        },
      ],
    };
  } else if (state.step === "age") {
    state.answers.age = answer(reply, ages);
    next = "themes";
    turn = {
      version: 1,
      parts: [
        {
          type: "prose",
          text: copy(
            "Lovely. One more and I'll draft the story direction.",
            "رائع. سؤال أخير قبل عرض فكرة القصة.",
          ),
        },
        {
          type: "question",
          kind: "multiple",
          prompt: copy(
            "What should the story celebrate?",
            "ما القيم التي تحتفي بها القصة؟",
          ),
          freeText: true,
          options: Object.entries(themes).map(([id, label]) => ({ id, label })),
        },
      ],
    };
  } else if (
    state.step === "themes" ||
    (state.step === "story" && reply?.kind === "changes")
  ) {
    if (state.step === "themes") state.answers.themes = answer(reply, themes);
    const change = reply?.kind === "changes" ? reply.text : null;
    if (!p.subjects.some((s) => s.id === "book"))
      await write(
        repo.addSubject(productionId, {
          ...mutation(),
          subject: { id: "book", kind: "book", label: "Book", pageRole: null },
        }),
      );
    for (const [artifactId, kind] of [
      ["concept", "concept"],
      ["outline", "outline"],
    ] as const)
      if (!p.subjects.some((s) => s.artifacts.some((a) => a.id === artifactId)))
        await write(
          repo.addArtifact(productionId, {
            ...mutation(),
            subjectId: "book",
            artifactId,
            kind,
          }),
        );
    if (!current2Maybe(p, "concept"))
      await localRevision(db, p, "concept", {
        kind: "concept",
        title: demo?.title ?? "The Little Dragon Who Shared",
        premise: p.brief.idea,
        audience: `${state.answers.audience}, ${state.answers.age}`,
        tone: "Warm and playful",
        constraints: [state.answers.themes].filter(Boolean),
      });
    state.outline += 1;
    const baseSummary =
      demo?.summary ??
      "A little dragon learns that sharing makes the sky brighter.";
    const summary = change
      ? `${baseSummary} Updated with your note: “${change}”.`
      : baseSummary;
    await localRevision(db, p, "outline", {
      kind: "outline",
      summary,
      beats: [{ id: "b1" }, { id: "b2" }, { id: "b3" }],
    });
    p = await repo.getProduction(productionId);
    const current2 = (id: string) => {
      const artifact = p.subjects
        .flatMap((s) => s.artifacts)
        .find((a) => a.id === id)!;
      return artifact.currentRevisionId!;
    };
    const tuple = async (artifactId: string) => {
      const revision = await repo.getRevision(
        productionId,
        current2(artifactId),
      );
      return {
        artifactId,
        revisionId: revision._id,
        contentHash: revision.contentHash,
      };
    };
    const concept = await tuple("concept");
    const outline = await tuple("outline");
    targets = [concept, outline];
    next = "story";
    turn = {
      version: 1,
      parts: [
        { type: "milestone", label: copy("Story", "القصة") },
        {
          type: "prose",
          text: change
            ? copy(
                "I've updated the outline with your note.",
                "أضفت ملاحظتك إلى مخطط القصة.",
              )
            : copy(
                "Here's the story direction I'd suggest.",
                "إليك فكرة القصة المقترحة.",
              ),
        },
        {
          type: "overview",
          target: concept,
          title: demo?.title ?? "The Little Dragon Who Shared",
          facts: [
            {
              label: copy("For", "لمن"),
              value: state.answers.audience || "Not stated",
            },
            {
              label: copy("Age", "العمر"),
              value: state.answers.age || "Not stated",
            },
            {
              label: copy("Celebrates", "تحتفي بـ"),
              value: state.answers.themes || "Not stated",
            },
          ],
        },
        {
          type: "synopsis",
          target: outline,
          title: copy("The story", "القصة"),
          body:
            summary +
            (demo
              ? "\n\n" +
                demo.beats.map((beat, i) => `${i + 1}. ${beat}`).join("\n")
              : "\n\n1. A dragon hoards every shining star.\n2. A lonely night shows the sky is dim without friends.\n3. Sharing the stars, the whole valley glows."),
        },
        {
          type: "approval",
          target: outline,
          subject: copy("the story outline", "مخطط القصة"),
        },
      ],
    };
  } else if (state.step === "story") {
    const callId = fingerprint([productionId, "local-artwork"]);
    await db.collection("bookletWork").updateOne(
      { callId, productionId, ownerId: p.ownerId },
      {
        $set: {
          runId: current._id,
          service: pace > 0 ? stages[0] : "image-executor",
          status: "dispatching",
          updatedAt: now,
        },
      },
      { upsert: true },
    );
    await db
      .collection<AiJob>("aiJobs")
      .updateOne({ _id: current._id }, { $set: { status: "running" } });
    await states.updateOne(
      { _id: productionId },
      { $set: { step: "production", requestId: null, producingSince: now } },
    );
    return;
  } else if (
    state.step === "production" ||
    (state.step === "artwork" && reply?.kind === "changes")
  ) {
    const elapsed = state.producingSince
      ? now.getTime() - state.producingSince.getTime()
      : Infinity;
    if (pace > 0 && elapsed < pace * stages.length) {
      await db.collection("bookletWork").updateOne(
        {
          callId: fingerprint([productionId, "local-artwork"]),
          productionId,
          ownerId: p.ownerId,
        },
        { $set: { service: stages[Math.floor(elapsed / pace)], updatedAt: now } },
      );
      return;
    }
    if (pace === 0 && elapsed < 4000) return;
    const pageId = p.creativeConfigSnapshot.includeCover
      ? "local-cover"
      : "local-page-1";
    const role = p.creativeConfigSnapshot.includeCover ? "cover" : "story";
    if (!p.subjects.some((subject) => subject.id === pageId))
      await write(
        repo.addSubject(productionId, {
          ...mutation(),
          subject: {
            id: pageId,
            kind: "page",
            label: "First illustration",
            pageRole: role,
          },
        }),
      );
    if (
      !p.subjects.some((subject) =>
        subject.artifacts.some((artifact) => artifact.id === "local-artwork"),
      )
    )
      await write(
        repo.addArtifact(productionId, {
          ...mutation(),
          subjectId: pageId,
          artifactId: "local-artwork",
          kind: "page-image",
        }),
      );
    const asset = await localAsset(db, p, pageId, reply?.kind === "changes");
    const artwork = await localRevision(
      db,
      p,
      "local-artwork",
      { kind: "page-image", asset },
      [asset],
    );
    p = await repo.getProduction(productionId);
    await db.collection("bookletWork").updateOne(
      {
        callId: fingerprint([productionId, "local-artwork"]),
        productionId,
        ownerId: p.ownerId,
      },
      { $set: { status: "succeeded", updatedAt: now } },
    );
    targets = [artwork];
    next = "artwork";
    turn = {
      version: 1,
      parts: [
        {
          type: "prose",
          text:
            demo && (reply?.kind === "changes" || state.revisionCategory)
              ? demo.artNote
              : copy(
                  "Here is the illustration for the opening of your book.",
                  "إليك الرسم الافتتاحي لكتابك.",
                ),
        },
        {
          type: "image",
          target: artwork,
          assetId: asset.assetId,
          alt: copy("The opening illustration", "الرسم الافتتاحي"),
        },
        {
          type: "approval",
          target: artwork,
          subject: copy("the opening illustration", "الرسم الافتتاحي"),
        },
      ],
    };
  } else {
    await deliverLocalBook(db, p, current);
    await states.updateOne({ _id: productionId }, { $set: { step: "done" } });
    return;
  }

  if (replyLength === "short" || replyLength === "long")
    turn = {
      ...turn,
      parts: turn.parts.map((part) =>
        part.type !== "prose"
          ? part
          : {
              ...part,
              text:
                replyLength === "short"
                  ? (part.text.match(/^[\s\S]*?[.!?؟](?=\s|$)/)?.[0] ?? part.text)
                  : part.text +
                    "\n\n" +
                    copy(
                      "A longer note, so you can check how a long reply reads. Every page of your book is planned with care: the story comes first, then the pictures, then the layout, and a last review makes sure everything fits together. You can ask for changes at any step, and nothing is final until you approve it.",
                      "ملاحظة أطول لتجربة طريقة عرض الرد الطويل. نخطط لكل صفحة من كتابك بعناية: القصة أولًا، ثم الرسوم، ثم تنسيق الصفحات، وأخيرًا مراجعة تتأكد من تناسق كل شيء. يمكنك طلب تغييرات في أي خطوة، ولا يصبح شيء نهائيًا قبل موافقتك.",
                    ),
            },
      ),
    };
  const question = turn.parts.find(
    (part) => part.type === "question" || part.type === "approval",
  );
  const human = await write(
    repo.requestHuman(productionId, {
      ...mutation(),
      runId: current._id,
      question:
        question?.type === "question" ? question.prompt : "Review this version",
      targets,
      responseContract: { mode: "raw-v1" },
      presentation: { version: 1, cards: [] },
      turn,
    }),
  );
  const formContent =
    human.humanRequest!.formContent + "\n{{#$output.response#}}";
  const token = "local-" + randomUUID();
  await persistAiEvent(
    db,
    (await db.collection<AiJob>("aiJobs").findOne({ _id: current._id }))!,
    {
      type: "decision",
      nodeId: "human",
      title: "Booklet conversation",
      token,
    },
  );
  await db.collection<Decision>("runDecisions").updateOne(
    { jobId: current._id, token },
    {
      $set: {
        form: {
          form_content: formContent,
          inputs: [{ type: "paragraph", output_variable_name: "response" }],
          user_actions: [{ id: "continue", title: "Continue" }],
          resolved_default_values: {},
          expiration_time: Math.floor(Date.now() / 1000) + 86400,
        } as never,
      },
    },
  );
  await states.updateOne(
    { _id: productionId },
    {
      $set: {
        step: next,
        requestId: human.humanRequest!.requestId,
        answers: state.answers,
        outline: state.outline,
      },
    },
  );
  console.log(`Posted ${next} turn for ${productionId.slice(0, 12)}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const current2Maybe = (
  p: {
    subjects: {
      artifacts: { id: string; currentRevisionId: string | null }[];
    }[];
  },
  id: string,
) =>
  p.subjects.flatMap((s) => s.artifacts).find((a) => a.id === id)
    ?.currentRevisionId ?? null;

type LocalAsset = { assetId: string; sha256: string };
type LocalSource = {
  artifactId: string;
  revisionId: string;
  contentHash: string;
};

// The fixture provides owned original bytes without a provider or paid work.
async function localAsset(
  db: Db,
  p: ProductionV2,
  key: string,
  alternate = false,
): Promise<LocalAsset> {
  const pageNumber = Number(key.match(/local-page-(\d+)/)?.[1] ?? 0);
  const filename = pageNumber ? `page-${Math.min(pageNumber, 4)}` : "cover";
  const image = await readFile(
    new URL(
      illustratedDemo
        ? `./fixtures/mina/${filename}.webp`
        : `../../docs/features/booklet-generation/workflow-package/fixtures/original-${alternate ? "b" : "a"}.png`,
      import.meta.url,
    ),
  );
  const sha256 = createHash("sha256").update(image).digest("hex");
  const assetId = fingerprint([p._id, key, sha256]);
  const createdAt = new Date();
  await db.collection("bookletAssets").updateOne(
    { _id: assetId as never },
    {
      $setOnInsert: {
        documentVersion: 1,
        ownerId: p.ownerId,
        productionId: p._id,
        operationId: "local-preview",
        outputKey: key,
        inputHash: fingerprint([key]),
        sha256,
        bytes: image.length,
        mime: illustratedDemo ? "image/webp" : "image/png",
        width: illustratedDemo ? 1024 : p.creativeConfigSnapshot.canvas.width,
        height: illustratedDemo ? 1536 : p.creativeConfigSnapshot.canvas.height,
        state: "ready",
        storage: { kind: "mongo" },
        sourceRevisions: [],
        originalAssetId: null,
        attachments: [],
        fence: 1,
        createdAt,
      },
    },
    { upsert: true },
  );
  await db.collection("bookletAssetBytes").updateOne(
    { _id: assetId as never },
    {
      $setOnInsert: {
        assetId,
        index: 0,
        sha256,
        bytes: new Binary(image),
      },
    },
    { upsert: true },
  );
  return { assetId, sha256 };
}

// In the disposable browser fixture, the production gateway's completion is
// represented by a published manifest. Real completion has separate MCP coverage.
async function deliverLocalBook(db: Db, p: ProductionV2, job: AiJob) {
  const config = p.creativeConfigSnapshot;
  const subjects = structuredClone(p.subjects);
  const book = subjects.find((subject) => subject.id === "book")!;
  if (!book.artifacts.some((a) => a.id === "local-layout"))
    book.artifacts.push(
      {
        id: "local-layout",
        kind: "book-layout",
        currentRevisionId: null,
        acceptedRevisionId: null,
      },
      {
        id: "local-manifest",
        kind: "book-manifest",
        currentRevisionId: null,
        acceptedRevisionId: null,
      },
    );
  const pageRows = [
    ...(config.includeCover
      ? [{ id: "local-cover", role: "cover" as const }]
      : []),
    ...Array.from({ length: config.storyPages }, (_, i) => ({
      id: `local-page-${i + 1}`,
      role: "story" as const,
    })),
  ];
  for (const page of pageRows)
    if (!subjects.some((subject) => subject.id === page.id))
      subjects.push({
        id: page.id,
        kind: "page",
        label: page.id,
        pageRole: page.role,
        artifacts: [],
      });
  await db
    .collection("bookletProductions")
    .updateOne({ _id: p._id as never }, { $set: { subjects } });
  const layout = await localRevision(db, { ...p, subjects }, "local-layout", {
    kind: "book-layout",
    canvas: config.canvas,
    direction: p.brief.language.direction,
    pages: pageRows.map((page, index) => {
      const text = illustratedDemo
        ? demoStory(p.brief.language.tag).pages[
            Math.max(0, index - Number(config.includeCover)) % 4
          ]
        : `The stars lit up the valley on page ${index + 1}.`;
      return {
        ...page,
        panels:
          page.role === "cover"
            ? []
            : [
                {
                  id: `panel-${index}`,
                  noText: false,
                  lettering: [
                    {
                      textId: `text-${index}`,
                      kind: "narration",
                      text,
                      start: 0,
                      end: text.length,
                    },
                  ],
                },
              ],
      };
    }),
  });
  const first = p.subjects
    .flatMap((subject) => subject.artifacts)
    .find((artifact) => artifact.id === "local-artwork");
  const approved = await db
    .collection<{ _id: string; assets: LocalAsset[] }>("bookletRevisions")
    .findOne({ _id: first?.currentRevisionId ?? "" });
  if (!approved?.assets[0])
    throw new Error("Approved fixture artwork is missing");
  const assets = [approved.assets[0]];
  for (const [index, page] of pageRows.slice(1).entries())
    assets.push(await localAsset(db, p, page.id, index % 2 === 0));
  const manifest = await localRevision(
    db,
    { ...p, subjects },
    "local-manifest",
    {
      kind: "book-manifest",
      pages: pageRows.map((page, i) => ({
        pageId: page.id,
        assetId: assets[i].assetId,
      })),
      continuityPairs: [],
    },
    assets,
    [layout],
  );
  await db.collection("bookletProductions").updateOne(
    { _id: p._id as never },
    {
      $set: {
        lifecycleState: "completed",
        currentManifestRevisionId: manifest.revisionId,
        mutationLease: null,
      },
    },
  );
  await db.collection<AiJob>("aiJobs").updateOne(
    { _id: job._id },
    {
      $set: {
        status: "succeeded",
        lease: null,
        terminationEvidence: "provider-completed",
      },
    },
  );
  if (illustratedDemo)
    await bookletLifecycleV2(db, {
      uid: p.ownerId,
      authTime: Math.floor(Date.now() / 1000),
    }).finishRun(p._id, job.consumption!.workflowId);
}

// Creative revisions are synthetic; each authored turn still passes requestHuman.
async function localRevision(
  db: Db,
  p: {
    _id: string;
    ownerId: string;
    subjects: { id: string; artifacts: { id: string }[] }[];
  },
  artifactId: string,
  content: Record<string, unknown>,
  assets: LocalAsset[] = [],
  sources: LocalSource[] = [],
) {
  const subjectId = p.subjects.find((s) =>
    s.artifacts.some((a) => a.id === artifactId),
  )!.id;
  const ordinal =
    (await db
      .collection("bookletRevisions")
      .countDocuments({ productionId: p._id, artifactId })) + 1;
  const _id = fingerprint([p._id, artifactId, "local", ordinal]);
  await db.collection("bookletRevisions").insertOne({
    _id: _id as never,
    documentVersion: 2,
    ownerId: p.ownerId,
    productionId: p._id,
    artifactId,
    subjectId,
    kind: content.kind,
    ordinal,
    content,
    sources,
    assets,
    provenance: {
      operationId: "local-" + artifactId + "-" + ordinal,
      runId: "local-preview",
      evidenceIds: [],
    },
    contentHash: fingerprint(content),
    createdAt: new Date(),
  });
  await db
    .collection("bookletProductions")
    .updateOne(
      { _id: p._id as never },
      { $set: { "subjects.$[s].artifacts.$[a].currentRevisionId": _id } },
      { arrayFilters: [{ "s.id": subjectId }, { "a.id": artifactId }] },
    );
  return { artifactId, revisionId: _id, contentHash: fingerprint(content) };
}
