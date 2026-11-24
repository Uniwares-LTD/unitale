/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates the function. */
// Run in the production browser fixture with its storage state loaded.
async (page) => {
  const origin = "http://127.0.0.1:3101";
  const context = await page.context().browser().newContext({
    serviceWorkers: "block",
    storageState: await page.context().storageState(),
  });
  const require = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  try {
    await context.clearCookies({ name: "unitale-locale" });
    const entry = await context.newPage();
    const balance = async () => {
      const response = await entry.request.get(`${origin}/api/booklets?section=default`);
      require(response.ok(), "Could not read the fixture balance");
      return (await response.json()).availableCredits;
    };
    const submissions = [];
    await entry.route(`${origin}/api/booklets`, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      submissions.push({
        body: route.request().postDataJSON(),
        status: response.status(),
        productionId: (await response.json()).productionId,
      });
      if (submissions.length === 1) await route.abort("failed");
      else await route.fulfill({ response });
    });
    await entry.goto(`${origin}/books/new`);
    const before = await balance();
    const idea = "A careful hedgehog keeps receipts.";
    const composer = entry.locator("#book-idea");
    const retry = entry.getByRole("button", { name: "Try again", exact: true });
    await composer.fill(idea);
    await composer.press("Enter");
    await entry.getByRole("button", { name: "Start my book", exact: true }).click();
    await retry.waitFor();
    const first = submissions[0];
    require(first?.status === 202 && first.productionId, "First start was not accepted before its response was lost");
    const afterFirst = await balance();
    require(before - afterFirst === first.body.acceptedCredits, "First start did not charge the accepted price");

    await entry.reload();
    await retry.waitFor();
    require(submissions.length === 1, "Reload automatically submitted the paid request again");
    require(await composer.inputValue() === idea && !(await composer.isEditable()), "Restored pending idea was missing or editable");
    await retry.click();
    await entry.waitForURL(`${origin}/books/${first.productionId}`);
    const second = submissions[1];
    require(submissions.length === 2 && second.status === 202, "Expected exactly one successful retry");
    require(JSON.stringify(second.body) === JSON.stringify(first.body), "Retry changed the consented request");
    require(second.productionId === first.productionId, "Retry opened a second booklet");
    require(await balance() === afterFirst, "Retry charged again");
    return { firstDebit: before - afterFirst, retryDebit: 0, sameProduction: true };
  } finally {
    await context.close();
  }
}
