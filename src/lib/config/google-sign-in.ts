import { z } from "zod";

export const firebaseProjectIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{4,62}$/);

// Shared by the server's public auth config and the document frame policy.
export function localFirebaseAuthDomain(
  environment: string | undefined,
  mode: string | undefined,
  projectId: string | undefined,
): string | null {
  if ((environment ?? "local") !== "local" || mode !== "firebase") return null;
  if (!firebaseProjectIdSchema.safeParse(projectId).success)
    throw new Error(
      "Invalid authentication configuration: FIREBASE_PROJECT_ID.",
    );
  return `${projectId}.firebaseapp.com`;
}
