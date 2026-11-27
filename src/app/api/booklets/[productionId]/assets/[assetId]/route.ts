import { requestBookletApplication } from "@/lib/server/booklets/application-request";
import { endpoint } from "@/lib/server/http";
import { requireVerified } from "@/lib/server/session";
import { pictureDisposition } from "@/project/booklets/download-name";

export const dynamic = "force-dynamic";

// Owned original image bytes. Booklet IDs never go through generic Run asset
// routes. Every read rechecks session, ownership and attachment; no caching.
export async function GET(
  request: Request,
  context: { params: Promise<{ productionId: string; assetId: string }> },
) {
  return endpoint(request, async (actor) => {
    const session = requireVerified(actor);
    const { productionId, assetId } = await context.params;
    const original = await requestBookletApplication(session).original(
      productionId,
      assetId,
    );
    return new Response(new Uint8Array(original.bytes), {
      headers: {
        "Content-Type": original.mime,
        "Content-Length": String(original.bytes.length),
        "Content-Disposition": pictureDisposition(
          new URL(request.url).searchParams.get("download"),
          original.mime,
        ),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
