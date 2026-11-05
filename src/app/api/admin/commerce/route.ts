import { endpoint, json, readJson } from "@/lib/server/http";
import { database } from "@/lib/server/mongo";
import {
  commerceAdminAction,
  commerceAdminCommand,
  commerceAdminView,
} from "@/lib/server/commerce/admin";
import { catalogPublicationAdapter } from "@/lib/server/commerce/publication-runtime";
import { extensionProductTypes } from "@/lib/server/extensions";
import { serverExtensions } from "@/project/server";
import { moduleEnabled } from "@/lib/project";
export async function GET(request: Request) {
  return endpoint(request, async (actor) => {
    const url = new URL(request.url);
    return json(
      await commerceAdminView(
        database(),
        actor,
        extensionProductTypes(serverExtensions, moduleEnabled),
        {
          section: url.searchParams.get("section") ?? undefined,
          after: url.searchParams.get("after") ?? undefined,
          uid: url.searchParams.get("uid") ?? undefined,
        },
      ),
    );
  });
}
export async function POST(request: Request) {
  return endpoint(request, async (actor) =>
    json(
      await commerceAdminAction(
        database(),
        actor,
        await readJson(request, commerceAdminCommand, 300000),
        extensionProductTypes(serverExtensions, moduleEnabled),
        catalogPublicationAdapter,
      ),
    ),
  );
}
