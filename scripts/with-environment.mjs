import { spawn } from "node:child_process";
import { loadLocalEnvironment } from "./environment.mjs";
if (!process.argv.includes("--manifest"))
  loadLocalEnvironment(process.env.NODE_ENV !== "production");
const child = spawn(process.execPath, process.argv.slice(2), {
  stdio: "inherit",
  windowsHide: true,
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
child.on("error", () => {
  console.error("Application command failed to start.");
  process.exitCode = 1;
});
