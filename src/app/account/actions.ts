"use server";
import { getTranslations } from "next-intl/server";
import { errorMessage } from "@/lib/server/error-message";
import { limitRequest } from "@/lib/server/rate-limit";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { AppError, requireSameOrigin } from "@/lib/auth-policy";
import { project } from "@/lib/project";
import { getConfig } from "@/lib/server/config";
import { requireSession } from "@/lib/server/session";
import {
  updateMyAccountDetails,
  updateMyAppearance,
} from "@/lib/server/profiles";
import { unstable_rethrow } from "next/navigation";
import { logOperation } from "@/lib/server/log";

export async function saveProfile(
  expectedUid: string,
  _previous: { message: string; saved: boolean },
  form: FormData,
) {
  return saveSection(
    expectedUid,
    () => updateMyAccountDetails({ displayName: form.get("displayName") }),
    (await getTranslations("actions"))("mc1632eafd446"),
  );
}

export async function saveAppearance(
  expectedUid: string,
  _previous: { message: string; saved: boolean },
  form: FormData,
) {
  return saveSection(
    expectedUid,
    () =>
      updateMyAppearance({
        theme: form.get("theme"),
        ...(project.theme ? {} : { style: form.get("style") }),
      }),
    (await getTranslations("actions"))("m60d6766a9e62"),
  );
}

async function saveSection(
  expectedUid: string,
  update: () => Promise<unknown>,
  message: string,
) {
  const started = performance.now();
  try {
    requireSameOrigin(await headers(), getConfig().server.origin);
    const session = await requireSession();
    await limitRequest("account:" + session.uid, "mutation");
    if (session.uid !== expectedUid)
      throw new AppError(
        "ACCOUNT_CHANGED",
        "Your account changed. Reload this page before editing.",
        409,
      );
    await update();
    revalidatePath("/account");
    revalidatePath("/preferences");
    logOperation("profile-save", started, 200);
    return { message, saved: true };
  } catch (error) {
    unstable_rethrow(error);
    logOperation(
      "profile-save",
      started,
      error instanceof AppError ? error.status : 503,
    );
    return {
      message: await errorMessage(
        error instanceof AppError
          ? error
          : new AppError("SERVICE_UNAVAILABLE", "Please try again.", 503),
      ),
      saved: false,
    };
  }
}
