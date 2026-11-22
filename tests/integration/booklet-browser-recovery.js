// prettier-ignore
// Recovery and revision clicks after booklet-browser-checks.js. Before this run:
//   tests/integration/booklet-fixture-seed.ts <uri> settle failed
// The script continues the failed booklet, then expects the caller to settle the
// new attempt as succeeded before booklet-browser-revision.js.
async (page) => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const origin = "http://127.0.0.1:3101";
  await page.context().clearCookies({ name: "unitale-locale" });
  await page.context().addCookies([{ name: "unitale-locale", value: "en", domain: "127.0.0.1", path: "/" }]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + "/runs");
  await page.getByRole("link", { name: /Booklet/ }).first().click();
  await page.waitForURL(/\/runs\/[^/]+$/);
  const continueButton = page.getByRole("button", { name: "Continue booklet" });
  await continueButton.waitFor({ timeout: 30000 });
  let posts = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/booklets\/[^/]+$/.test(new URL(r.url()).pathname)) posts += 1;
  });
  await continueButton.click();
  await page.getByText(/^Attempt 2/).first().waitFor({ timeout: 30000 });
  assert(posts === 1, "one continue request: " + posts);
  return "continue after verified failure chains attempt 2";
}
