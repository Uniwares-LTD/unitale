"use client";

import type { ComponentProps, FC } from "react";
import type { RunDetail } from "@/components/runs/run-ui";

// Booklet Runs resolve to their conversation before the generic detail mounts.
export const ProjectRunDetail: FC<{
  data: ComponentProps<typeof RunDetail>["initial"];
  refresh: () => Promise<void>;
}> = () => null;
