import fs from "node:fs";
import path from "node:path";
const file = process.argv[1];
if (file && process.env.NODE_TEST_CONTEXT && file.endsWith(".test.ts")) {
  const name = path.basename(file);
  const marker = path.join(process.env.VALIDATE_ACCOUNT_PROGRESS, name);
  fs.writeFileSync(marker, "running");
  process.once("exit", () => fs.writeFileSync(marker, "finished"));
}
