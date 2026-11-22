import { bookletCreationCommandSchema } from "@/project/booklets/application-contract";
import { bookletApplication } from "@/lib/server/booklets/application";
import { extensionProductTypes } from "@/lib/server/extensions";
import { checkMutation, endpoint, json, readJson } from "@/lib/server/http";
import { database } from "@/lib/server/mongo";
import { requireSession } from "@/lib/server/session";
import { moduleEnabled } from "@/lib/project";
import { serverExtensions } from "@/project/server";

export const dynamic = "force-dynamic";

function application(session: { uid: string; auth_time: number }) {
  return bookletApplication(
    database(),
    { uid: session.uid, authTime: session.auth_time },
    { types: extensionProductTypes(serverExtensions, moduleEnabled) },
  );
}

// GET: domain-picker rows (default) or `section=packages` published summaries.
export async function GET(request: Request) {
  return endpoint(request, async (session) => {
    const query = new URL(request.url).searchParams;
    const app = application(session);
    const cursor = query.get("cursor");
    return json(
      query.get("section") === "packages"
        ? await app.packages({ cursor })
        : await app.picker({ search: query.get("search"), cursor }),
    );
  });
}

// POST: discriminated quote/start commands. Paid start needs a verified session.
export async function POST(request: Request) {
  return endpoint(request, async () => {
    await checkMutation(request);
    const session = await requireSession();
    const command = await readJson(
      request,
      bookletCreationCommandSchema,
      24000,
    );
    const app = application(session);
    return command.action === "quote"
      ? json(await app.quote(command))
      : json(await app.start(command), 202);
  });
}
