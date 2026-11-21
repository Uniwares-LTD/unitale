import { z } from "zod";

export const designStyleSchema = z.enum(["classic", "glass", "soft-blue"]);
