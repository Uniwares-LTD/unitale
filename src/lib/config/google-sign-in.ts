import { z } from "zod";

export const firebaseProjectIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{4,62}$/);

// Shared by the server's public auth config and the document frame policy.
// Real Firebase signs in with a popup on the project's default auth domain in
// every environment, so no per-host OAuth origin or redirect is registered.
// Only the Auth Emulator keeps the same-site redirect flow.
export function firebasePopupAuthDomain(
  mode: string | undefined,
  projectId: string | undefined,
): string | null {
  if (mode !== "firebase") return null;
  if (!firebaseProjectIdSchema.safeParse(projectId).success)
    throw new Error(
      "Invalid authentication configuration: FIREBASE_PROJECT_ID.",
    );
  return `${projectId}.firebaseapp.com`;
}
