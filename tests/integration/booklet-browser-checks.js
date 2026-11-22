// prettier-ignore
// Booklet start and home checks against the owned browser fixture seeded by
// booklet-fixture-seed.ts. Run with a named playwright-cli session after
// `state-load output/playwright/runs-state.json`:
//   playwright-cli -s=booklet run-code --filename=tests/integration/booklet-browser-checks.js
async (page) => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const origin = "http://127.0.0.1:3101";
  const results = [];
  const context = page.context();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  // The app may also set this cookie; replace every copy so one value applies.
  const locale = async (value) => {
    await context.clearCookies({ name: "unitale-locale" });
    await context.addCookies([{ name: "unitale-locale", value, domain: "127.0.0.1", path: "/" }]);
  };
  const noOverflow = async (label) => {
    const wide = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    assert(!wide, `${label}: horizontal overflow`);
  };
  const cookies = await context.cookies();

  // Signed out: sign-in returns to the book start.
  await context.clearCookies();
  await locale("en");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + "/");
  const signIn = page.getByRole("link", { name: "Sign in to create a book", exact: true });
  assert((await signIn.getAttribute("href")) === "/account?next=%2Fruns%2Fnew", "sign-in return path");
  results.push("signed-out home: sign-in returns to /runs/new");
  await context.addCookies(cookies);

  for (const [lang, width] of [["en", 1440], ["ar", 390], ["en", 390], ["ar", 1440]]) {
    await locale(lang);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + "/");
    assert((await page.locator("html").getAttribute("dir")) === (lang === "ar" ? "rtl" : "ltr"), "direction");
    const create = page.getByRole("link", { name: lang === "ar" ? "أنشئ كتابًا" : "Create a book", exact: true });
    assert((await create.getAttribute("href")) === "/runs/new", "create link");
    await noOverflow(`home ${lang} ${width}`);
    await page.screenshot({ path: `output/playwright/booklet-home-${lang}-${width}.png`, fullPage: true });
    await page.goto(origin + "/runs/new");
    await page.getByRole("radio").first().waitFor();
    assert((await page.getByRole("radio").count()) === 3, "three packages");
    assert(await page.getByRole("radio").nth(2).isDisabled(), "unavailable package disabled");
    await noOverflow(`start ${lang} ${width}`);
    await page.screenshot({ path: `output/playwright/booklet-start-${lang}-${width}.png`, fullPage: true });
    results.push(`home and start render ${lang} ${width}px without overflow`);
  }

  // English journey at desktop width.
  await locale("en");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + "/runs/new");
  await page.getByRole("radio").first().waitFor();
  await page.getByRole("button", { name: "Review price" }).click();
  await page.getByText("Choose a package.").waitFor();
  assert(
    await page.evaluate(() => document.activeElement?.getAttribute("data-booklet-field") === "catalogId"),
    "focus moves to the first invalid control",
  );
  await page.getByRole("radio", { name: /^4 story pages/ }).check();
  await page.getByRole("textbox", { name: "Book title" }).fill("The lantern");
  await page.getByRole("textbox", { name: "Story idea" }).fill("A lantern learns to glow.");
  await page.getByRole("textbox", { name: "Audience" }).fill("Children");
  await page.getByRole("textbox", { name: "Characters" }).fill("A\nB\nC\nD");
  await page.getByRole("button", { name: "Review price" }).click();
  await page.getByText("Too many entries for this package.").first().waitFor();
  assert(
    await page.evaluate(() => document.activeElement?.getAttribute("data-booklet-field") === "characters"),
    "focus moves to characters",
  );
  await page.getByRole("textbox", { name: "Characters" }).fill("Lantern");
  await page.getByRole("button", { name: "Review price" }).click();
  await page.getByRole("heading", { name: "Price" }).waitFor();
  assert(await page.getByRole("region", { name: "Price" }).getByText("20 credits", { exact: true }).isVisible(), "quoted price shown");
  results.push("validation focus, quote and price shown");

  // Consent: cancel sends nothing; confirm starts once and opens the Run.
  let starts = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/booklets") && request.method() === "POST" && request.postData()?.includes('"start"')) starts += 1;
  });
  await page.getByRole("button", { name: "Start book" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.waitFor();
  assert((await dialog.textContent()).includes("20 credits are charged"), "consent states credits");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  assert(starts === 0, "cancel sends no start");
  await page.getByRole("button", { name: "Start book" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm and start" }).click();
  await page.waitForURL(/\/runs\/[^/]+$/, { timeout: 30000 });
  assert(starts === 1, "exactly one start request");
  results.push("consent dialog, single start and Run navigation: " + new URL(page.url()).pathname);

  // 10.3: the booklet panel inside the existing Run page.
  await page.getByRole("heading", { name: "The lantern", level: 2 }).waitFor({ timeout: 30000 });
  await page.getByText(/^0 of 5 pages selected$/).waitFor();
  assert(await page.getByText("Nothing has been saved yet. Results appear here as each step finishes.").isVisible(), "empty saved state");
  const productionLink = await page.evaluate(async () => {
    const response = await fetch(location.pathname.replace("/runs/", "/api/runs/"));
    return (await response.json()).target?.id ?? null;
  });
  assert(productionLink, "run target present");
  const leak = await page.evaluate(
    async (id) => (await fetch(`/api/booklets/${id}/assets/not-owned`)).status,
    productionLink,
  );
  assert(leak === 404, "unowned asset is not served: " + leak);
  await noOverflow("run panel en 1440");
  await page.screenshot({ path: "output/playwright/booklet-run-en-1440.png", fullPage: true });
  results.push("run panel shows saved progress; unowned asset returns 404");

  // 10.4: next steps come from server eligibility. While a Run is active the
  // panel explains the existing Cancel run and offers no revision or continue.
  await page.getByRole("heading", { name: "Next steps", level: 3 }).waitFor();
  const working = await page.getByText(/^The booklet is working\./).isVisible();
  const continuing = await page.getByRole("button", { name: "Continue booklet" }).isVisible();
  assert(working !== continuing, "either active guidance or continue, never both");
  if (working)
    assert(!(await page.getByRole("group", { name: "Request changes" }).isVisible()), "no revision while running");
  results.push("next steps follow server eligibility (" + (working ? "active Run" : "continue offered") + ")");

  // 10.5: on-demand history inside the Run page.
  await page.getByText("Runs for this book", { exact: true }).click();
  await page.getByText(/This run ·/).waitFor();
  await page.getByText("Versions of this book", { exact: true }).click();
  await page.getByText("Current version", { exact: true }).waitFor();
  const malformed = await page.evaluate(
    async (id) => (await fetch(`/api/booklets/${id}?section=history&kind=runs&cursor=%25%25`)).status,
    productionLink,
  );
  assert(malformed === 400, "malformed cursor is a 400: " + malformed);
  await noOverflow("history en 1440");
  results.push("history lists this run and current version; malformed cursor is 400");

  // 10.6: admin stays English/LTR with an Arabic public preference, then restores it.
  await locale("ar");
  await page.goto(origin + "/admin/booklets");
  assert((await page.locator("html").getAttribute("dir")) === "ltr", "admin is LTR");
  await page.getByRole("heading", { name: "Booklets", level: 1 }).waitFor();
  const llm = page.getByRole("textbox", { name: "Paid LLM actions" }).first();
  await llm.fill("11");
  await page.getByRole("button", { name: "Save retry defaults" }).first().click();
  await page.getByText("Enter a whole number from 0 to 10.").first().waitFor();
  assert(await llm.evaluate((el) => el === document.activeElement), "focus on invalid admin field");
  await llm.fill("3");
  await page.getByRole("button", { name: "Save retry defaults" }).first().click();
  await page.getByText("Retry defaults saved for new productions.").waitFor();
  await page.getByText("3 / 0 / 3").waitFor();
  await noOverflow("admin 1440");
  await page.screenshot({ path: "output/playwright/booklet-admin-1440.png", fullPage: true });
  await page.goto(origin + "/");
  assert((await page.locator("html").getAttribute("dir")) === "rtl", "public Arabic restored");
  results.push("admin English/LTR edit with validation and save; Arabic restored after admin");

  // Editing after a shown price invalidates it. (The dirty form is left in place;
  // the caller verifies the leave warning with a CLI goto afterwards.)
  await locale("en");
  await page.goto(origin + "/runs/new");
  await page.getByRole("radio").first().waitFor();
  await page.getByRole("radio", { name: /^4 story pages/ }).check();
  await page.getByRole("textbox", { name: "Book title" }).fill("Second");
  await page.getByRole("textbox", { name: "Story idea" }).fill("Idea");
  await page.getByRole("textbox", { name: "Audience" }).fill("Adults");
  await page.getByRole("button", { name: "Review price" }).click();
  await page.getByRole("heading", { name: "Price" }).waitFor();
  await page.getByRole("textbox", { name: "Audience" }).fill("Teens");
  assert(!(await page.getByRole("heading", { name: "Price" }).isVisible()), "edit clears quote");
  results.push("editing after a quote requires a fresh quote");
  assert(errors.length === 0, "page errors: " + errors.join("; "));
  return results.join(" | ");
}
