"use client";

import type { ComponentProps, ComponentType } from "react";
import type { RunDetail } from "@/components/runs/run-ui";

// Project-owned controls inside the existing poller. Authorization stays server-side.
export const ProjectRunDetail: ComponentType<{
  data: ComponentProps<typeof RunDetail>["initial"];
  refresh: () => Promise<void>;
}> = () => null;
