"use client";

import { RunLanding } from "@/components/runs/run-start";

// Project-owned start composition; client-safe code only. The default preserves
// generic admission. Projects may compose RunLanding with their product form.
export const ProjectRunStart = RunLanding;
