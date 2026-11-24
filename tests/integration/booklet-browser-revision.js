// prettier-ignore
// Revision consent after booklet-browser-recovery.js and
//   tests/integration/booklet-fixture-seed.ts <uri> settle succeeded
async (page) => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const origin = "http://127.0.0.1:3101";
  await page.reload();
  const form = page.getByRole("group", { name: "Request changes" });
  await form.waitFor({ timeout: 30000 });
  await form.getByRole("radio", { name: "Story" }).check();
  await page.getByRole("button", { name: "Review price" }).click();
  await page.getByText("Included in your package. No credits are charged.").waitFor();
  await page.getByRole("button", { name: "Start changes" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.waitFor();
  assert((await dialog.textContent()).includes("revision included in your package"), "consent names the included revision");
  const before = page.url();
  await dialog.getByRole("button", { name: "Confirm and start" }).click();
  await page.waitForURL((url) => url.href !== before && /\/runs\/[^/]+$/.test(url.pathname), { timeout: 30000 });
  await page.getByRole("heading", { name: "The lantern", level: 2 }).waitFor();
  assert(new URL(page.url()).origin === origin, "same origin");
  return "included story revision with explicit consent opens a new Run";
}
