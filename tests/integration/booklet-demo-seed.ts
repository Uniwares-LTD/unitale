// Add prepared demo books through the real quote/start/reply facade. Loopback only.
// Run with the owned fixture environment and UNITALE_DEMO_STORYBOOK=1 Manager.
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";
import { bookletApplication } from "../../src/lib/server/booklets/application";
import { creativeFieldsSchema } from "../../src/lib/server/booklets/documents";
import { grantCredits } from "../../src/lib/server/store/credits";
import { fixtureDatabasePattern } from "./project-fixture.mjs";
import { demoStory } from "./booklet-demo-story";
async function main() {
  const uri = process.env.MONGODB_URI ?? "";
  const name = process.env.MONGODB_DATABASE ?? "";
  if (
    !/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri) ||
    !fixtureDatabasePattern.test(name) ||
    process.env.AUTH_MODE !== "emulator"
  )
    throw new Error("Owned disposable fixture only.");
  const client = new MongoClient(uri);
  try {
    const db = client.db(name);
    const owner = await db
      .collection<{ _id: string }>("accountAccess")
      .findOne({ role: "admin" });
    if (!owner) throw new Error("Fixture owner missing.");
    const app = bookletApplication(
      db,
      { uid: owner._id, authTime: Math.floor(Date.now() / 1000) },
      {
        types: [
          { id: "booklet", schemaVersion: 1, fields: creativeFieldsSchema },
        ],
      },
    );
    await grantCredits(db, owner._id, "mina-demo-library-v1", {
      amount: 100,
      source: "purchase",
      reference: "Prepared local sample books",
    });
    const results = [];
    for (const [language, stopAtReview] of [
      ["en", false],
      ["ar", false],
      ["en", true],
    ] as const) {
      const marker = `mina-demo-v1-${language}-${stopAtReview ? "review" : "ready"}`;
      const seeds = db.collection<{
        _id: string;
        key: string;
        productionId?: string;
      }>("localDemoSeeds");
      await seeds.updateOne(
        { _id: marker },
        { $setOnInsert: { key: randomUUID() } },
        { upsert: true },
      );
      const seed = (await seeds.findOne({ _id: marker }))!;
      let id = seed.productionId;
      if (!id) {
        const quote = (await app.entry()).package;
        if (!quote?.available) throw new Error("Demo package unavailable.");
        const result = await app.startIdea({
          action: "start-idea",
          key: seed.key,
          catalogId: quote.catalogId,
          revision: quote.revision,
          quoteHash: quote.quoteHash,
          acceptedCredits: quote.credits,
          language,
          idea: demoStory(language).title,
        });
        id = result.productionId;
        await seeds.updateOne({ _id: marker }, { $set: { productionId: id } });
      }
      const deadline = Date.now() + 90000;
      let done = false;
      while (Date.now() < deadline) {
        const conversation = await app.conversation(id);
        const turn = conversation.turns.findLast((t) => t.status === "open");
        if (
          conversation.completed ||
          (stopAtReview && turn?.turn.parts.some((p) => p.type === "synopsis"))
        ) {
          done = true;
          break;
        }
        if (turn) {
          const part = turn.turn.parts.find(
            (p) => p.type === "question" || p.type === "approval",
          );
          if (part?.type === "question")
            await app.command(id, {
              action: "reply",
              key: randomUUID(),
              requestId: turn.requestId,
              reply: {
                version: 1,
                kind: "answer",
                choices: [part.options[0].id],
                text: "",
              },
            });
          else if (part?.type === "approval")
            await app.command(id, {
              action: "reply",
              key: randomUUID(),
              requestId: turn.requestId,
              reply: { version: 1, kind: "approve", target: part.target },
            });
        }
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      if (!done)
        throw new Error(`Demo did not reach its intended state: ${marker}`);
      results.push({
        language,
        state: stopAtReview ? "story-review" : "ready",
        url: `/books/${id}`,
      });
    }
    await writeFile(
      "output/issue-20/interactive-preview/demo-books.json",
      JSON.stringify(results, null, 2) + "\n",
    );
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await client.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
