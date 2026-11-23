import { endpoint, json, readJson } from "@/lib/server/http";
import { database } from "@/lib/server/mongo";
import { requireModule } from "@/lib/server/modules";
import {
  bookletAdminView,
  bookletDefaultPackageUpdateSchema,
  bookletRetryDefaultsUpdateSchema,
  updateBookletDefaultPackage,
  updateBookletRetryDefaults,
} from "@/lib/server/booklets/admin";

export const dynamic = "force-dynamic";

// Core /api/admin is not a module route, so the booklets guard is explicit.
export async function GET(request: Request) {
  return endpoint(request, async (actor) => {
    requireModule("booklets");
    return json(await bookletAdminView(database(), actor));
  });
}

export async function POST(request: Request) {
  return endpoint(request, async (actor) => {
    requireModule("booklets");
    return json(
      await updateBookletRetryDefaults(
        database(),
        actor,
        await readJson(request, bookletRetryDefaultsUpdateSchema, 4000),
      ),
    );
  });
}

export async function PUT(request: Request) {
  return endpoint(request, async (actor) => {
    requireModule("booklets");
    return json(
      await updateBookletDefaultPackage(
        database(),
        actor,
        await readJson(request, bookletDefaultPackageUpdateSchema, 4000),
      ),
    );
  });
}
