import { bookletCreationCommandSchema } from "@/project/booklets/application-contract";
import { requestBookletApplication } from "@/lib/server/booklets/application-request";
import { checkMutation, endpoint, json, readJson } from "@/lib/server/http";
import { requireSession, requireVerified } from "@/lib/server/session";

export const dynamic = "force-dynamic";

// GET: domain-picker rows (default), `section=packages` published summaries,
// or `section=default` for the conversation entry (default package, balance).
export async function GET(request: Request) {
  return endpoint(request, async (session) => {
    const query = new URL(request.url).searchParams;
    const app = requestBookletApplication(requireVerified(session));
    const cursor = query.get("cursor");
    return json(
      query.get("section") === "packages"
        ? await app.packages({ cursor })
        : query.get("section") === "default"
          ? await app.entry()
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
    const app = requestBookletApplication(session);
    return command.action === "quote"
      ? json(await app.quote(command))
      : command.action === "start-idea"
        ? json(await app.startIdea(command), 202)
        : json(await app.start(command), 202);
  });
}
