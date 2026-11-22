import { requestBookletApplication } from "@/lib/server/booklets/application-request";
import { endpoint, json } from "@/lib/server/http";
import { requireVerified } from "@/lib/server/session";

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
