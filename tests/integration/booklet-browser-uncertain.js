// prettier-ignore
// After `booklet-fixture-seed.ts <uri> settle unknown`: the newest booklet Run is
// reconciling. The panel must say saved work is kept and nothing is repeated, and
// must not offer Continue or a revision while the outcome is unknown.
async (page) => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  await page.context().clearCookies({ name: "unitale-locale" });
  await page.context().addCookies([{ name: "unitale-locale", value: "en", domain: "127.0.0.1", path: "/" }]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://127.0.0.1:3101/runs");
  await page.getByRole("link", { name: /Booklet/ }).first().click();
  await page.waitForURL(/\/runs\/[^/]+$/);
  await page.getByText("The latest step is being confirmed", { exact: true }).waitFor({ timeout: 30000 });
  assert(
    await page.getByText("Saved work is shown below. Nothing is repeated or charged again while the outcome is confirmed.").isVisible(),
    "uncertainty explanation shown",
  );
  assert(!(await page.getByRole("button", { name: "Continue booklet" }).isVisible()), "no continue while uncertain");
  assert(!(await page.getByRole("group", { name: "Request changes" }).isVisible()), "no revision while uncertain");
  return "reconciling Run shows the uncertainty notice and offers no continue or revision";
}
