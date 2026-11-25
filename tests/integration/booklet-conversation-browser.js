/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates the function. */
// Run with the owned browser fixture, booklet seed, scripted Manager and
// output/playwright/runs-state.json loaded into the named Playwright session.
async (page) => {
  const origin = "http://127.0.0.1:3101";
  const errors = [];
  const require = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const button = (name) => page.getByRole("button", { name, exact: true });
  const reply = page.locator("#book-reply");
  const capture = (name) =>
    page.screenshot({ path: `output/playwright/10c4-${name}.png` });
  let sent = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /^\/api\/booklets\/[^/]+$/.test(new URL(request.url()).pathname)
    )
      sent += 1;
  });
  await page.context().clearCookies({ name: "unitale-locale" });
  await page.setViewportSize({ width: 393, height: 850 });
  await page.emulateMedia({
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  await page.goto(origin + "/books/new");
  await page.getByRole("link", { name: "Back", exact: true }).waitFor();
  const idea = page.getByRole("textbox", { name: "Your story idea" });
  await idea.fill("A little dragon learns to share the stars.");
  await capture("entry");
  await idea.press("Enter");
  await button("Start my book").click();
  await page.waitForURL(/\/books\/[a-f0-9]{64}$/);
  const conversation = page.url();
  await page
    .locator('p[aria-hidden="true"]')
    .filter({ hasText: "What a" })
    .waitFor();
  await page.keyboard.press("Shift");
  await button("My child").waitFor();
  await capture("question");
  await button("My child").click();
  await page.getByRole("button", { name: /^4.5$/ }).click();
  await button("Kindness").click();
  await button("Curiosity").click();
  require((await button("Kindness").getAttribute("aria-pressed")) ===
    "true", "Multiple choice is not a draft");
  await reply.fill("Friendship matters, too.");
  await reply.press("Shift+Enter");
  require((await reply.inputValue()).includes(
    "\n",
  ), "Shift+Enter did not insert a line");
  const beforeComposing = sent;
  await reply.dispatchEvent("keydown", {
    key: "Enter",
    bubbles: true,
    isComposing: true,
  });
  require(sent === beforeComposing, "IME Enter sent a reply");
  const productionApi =
    origin +
    "/api/booklets/" +
    new URL(conversation).pathname.split("/").at(-1);
  const rejectReply = async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 400,
      json: {
        error: {
          code: "BOOKLET_REPLY_INVALID",
          message: "Fixture validation refused this reply.",
          requestId: "fixture-reply-validation",
        },
      },
    });
  };
  await page.route(productionApi, rejectReply);
  await reply.press("Enter");
  await page
    .getByRole("alert")
    .filter({ hasText: "Your message wasn’t sent. Your text is kept." })
    .waitFor();
  require((await reply.inputValue()) ===
    "Friendship matters, too.\n", "Validation discarded the reply draft");
  require(await reply.evaluate(
    (element) => document.activeElement === element,
  ), "Validation moved focus away from the reply");
  require((await button("Kindness").getAttribute("aria-pressed")) ===
    "true", "Validation cleared the selected choices");
  await page.unroute(productionApi, rejectReply);
  await button("Try again").click();

  const approve = button("Approve this version");
  await approve.waitFor();
  await capture("outline");
  await button("Request changes").click();
  await reply.fill("Set the story by the sea.");
  await reply.press("Enter");
  await page.getByText(/Updated with your note/).waitFor();
  await approve.waitFor();
  await reply.fill("Please keep the stars very bright.");
  await approve.click();
  await page.getByText("Preparing your artwork…", { exact: true }).waitFor();
  await capture("production");

  const move = page.getByRole("alertdialog", {
    name: "Move your draft to this review?",
  });
  await move.getByRole("button", { name: "Keep draft" }).click();
  require((await reply.inputValue()) ===
    "", "An unsent draft was silently retargeted");
  await button("Review draft").click();
  await move.getByRole("button", { name: "Move draft" }).click();
  require((await reply.inputValue()) ===
    "Please keep the stars very bright.", "The moved draft was lost");

  const illustration = page.getByRole("button", {
    name: /Open artwork.*The opening illustration/,
  });
  await illustration.scrollIntoViewIfNeeded();
  await illustration.focus();
  const beforeZoom = await page.evaluate(() => window.scrollY);
  await illustration.press("Enter");
  const viewer = page.getByRole("dialog", { name: "The opening illustration" });
  await viewer.getByRole("img").waitFor();
  await viewer.getByRole("button", { name: "Zoom in" }).click();
  require(await viewer
    .getByRole("button", { name: "Zoom out" })
    .isVisible(), "Artwork zoom did not engage");
  await capture("artwork");
  await page.keyboard.press("Escape");
  await viewer.waitFor({ state: "hidden" });
  await page.waitForFunction(
    (top) => Math.abs(window.scrollY - top) <= 2,
    beforeZoom,
  );
  require(await illustration.evaluate(
    (element) => document.activeElement === element,
  ), "Artwork focus did not return");
  require((await reply.inputValue()) ===
    "Please keep the stars very bright.", "Opening artwork cleared the draft");
  // Request a second cover. The fixture retains original-a for the first
  // version and original-b for the revised illustration.
  await button("Request changes").click();
  await reply.fill("Brighten the sky in the opening illustration.");
  await reply.press("Enter");
  await illustration.nth(1).waitFor();

  const conversationApi = `${productionApi}?section=conversation`;
  let browsingEarlier = false;
  const holdCompletedView = async (route) => {
    const response = await route.fetch();
    if (
      !browsingEarlier &&
      response.ok() &&
      (await response.json()).completed
    ) {
      browsingEarlier = true;
      await page.evaluate(async () => {
        window.scrollTo(0, 0);
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      });
    }
    await route.fulfill({ response });
  };
  await page.route(conversationApi, holdCompletedView);
  await approve.click();
  try {
    await button("New response").waitFor();
    require(browsingEarlier &&
      (await page.evaluate(
        () => window.scrollY <= 2,
      )), "New content interrupted browsing the earlier transcript");
    await button("New response").click();
  } finally {
    await page.unroute(conversationApi, holdCompletedView);
  }

  await button("Read your book").click();
  const reader = page.getByRole("dialog");
  await reader.getByText("Cover", { exact: true }).waitFor();
  const checkDownload = async (expectedSha256) => {
    const link = reader.getByRole("link", { name: "Download", exact: true });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      link.click(),
    ]);
    const stream = await download.createReadStream();
    const bytes = [];
    for await (const chunk of stream) bytes.push(...chunk);
    const digest = await page.evaluate(async (data) => {
      const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(data));
      return Array.from(new Uint8Array(hash), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
    }, bytes);
    require(digest ===
      expectedSha256, "Downloaded bytes differ from the retained fixture original");
    require(download.url() ===
      new URL(await reader.getByRole("img").getAttribute("src"), origin)
        .href, "Download did not use the displayed manifest page");
  };
  await checkDownload(
    "6ba39f5e8928a00b6396ff8a91144123175fd201e1065c996eadf9d4cb363523",
  );
  require(await reader
    .getByRole("button", { name: "Previous page" })
    .isDisabled(), "Reader moved before the cover");
  await capture("cover");
  await page.keyboard.press("ArrowRight");
  await reader.getByText("Page 1 of 4", { exact: true }).waitFor();
  await reader.getByText(/The stars lit up the valley/).waitFor();
  await capture("reader");
  await reader.getByRole("button", { name: "Next page" }).click();
  await checkDownload(
    "85f4e38d333e174ced79217c90a564699fcd589be0d376a91629dc96d48ada49",
  );
  for (let index = 0; index < 2; index += 1)
    await reader.getByRole("button", { name: "Next page" }).click();
  require(await reader
    .getByRole("button", { name: "Next page" })
    .isDisabled(), "Reader moved after its last page");
  await page.keyboard.press("Escape");

  await page.getByText("Progress and history", { exact: true }).click();
  await page.getByText("History", { exact: true }).waitFor();
  const status = await page.request.get(conversation + "?probe=1");
  require(status.ok(), "The owned conversation could not be reopened");
  const productionId = new URL(conversation).pathname.split("/").at(-1);
  const data = await (
    await page.request.get(
      `${origin}/api/booklets/${productionId}?section=conversation`,
    )
  ).json();
  await page.goto(`${origin}/runs/${data.runId}`);
  await page.waitForURL(conversation);
  require(page.url() ===
    conversation, "The booklet Run did not redirect to its conversation");
  await page.goto(origin + "/runs/new");
  require((await page
    .getByRole("link", { name: "Create a book", exact: true })
    .getAttribute("href")) ===
    "/books/new", "The Run entry did not link to the conversation");
  await page.goto(conversation);
  require(errors.length === 0, errors.join("\n"));
  require(sent ===
    8, `Expected seven accepted replies and one fixture refusal, saw ${sent} submissions`);
  return {
    conversation,
    sent,
    knownReplyRefusal: true,
    historyPreserved: true,
    pageErrors: errors,
  };
};
