import { bookletProductionCommandSchema } from "@/project/booklets/application-contract";
import { requestBookletApplication } from "@/lib/server/booklets/application-request";
import { checkMutation, endpoint, json, readJson } from "@/lib/server/http";
import { requireSession, requireVerified } from "@/lib/server/session";

export const dynamic = "force-dynamic";

// GET: the owned, allowlisted production view.
export async function GET(
  request: Request,
  context: { params: Promise<{ productionId: string }> },
) {
  return endpoint(request, async (actor) => {
    const session = requireVerified(actor);
    const { productionId } = await context.params;
    return json(await requestBookletApplication(session).view(productionId));
  });
}

// POST: revision quote/start, retry and continue. Each command has a strict
// schema and a stable key; ownership is rechecked fresh by the facade.
export async function POST(
  request: Request,
  context: { params: Promise<{ productionId: string }> },
) {
  return endpoint(request, async () => {
    await checkMutation(request);
    const session = await requireSession();
    const command = await readJson(
      request,
      bookletProductionCommandSchema,
      8000,
    );
    const { productionId } = await context.params;
    const result = await requestBookletApplication(session).command(
      productionId,
      command,
    );
    return json(result, command.action === "quote-revision" ? 200 : 202);
  });
}
