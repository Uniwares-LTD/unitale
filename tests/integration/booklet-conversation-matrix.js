/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates the function. */
// Run after booklet-conversation-browser.js with the same browser session.
async (page) => {
  const origin = "http://127.0.0.1:3101";
  const conversation = page.url();
  if (!/\/books\/[a-f0-9]{64}$/.test(conversation)) throw new Error("Open the completed fixture conversation");
  const require = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const context = page.context();
  const errors = [];
  const results = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await context.addInitScript(() => localStorage.removeItem("unitale-theme"));
  for (const locale of ["en", "ar"]) {
    await context.clearCookies({ name: "unitale-locale" });
    await context.addCookies([{ name: "unitale-locale", value: locale, url: origin }]);
    for (const colorScheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      for (const width of [393, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const [name, url] of [["entry", origin + "/books/new"], ["conversation", conversation]]) {
          const frame = `${name}-${locale}-${colorScheme}-${width}`;
          await page.goto(url);
          await page.getByRole("heading", { level: 1 }).waitFor();
          const rendered = await page.evaluate(() => ({
            locale: document.documentElement.lang,
            dir: document.documentElement.dir,
            dark: document.documentElement.classList.contains("dark"),
            overflow: document.documentElement.scrollWidth - innerWidth,
            reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
          }));
          require(rendered.locale === locale && rendered.dir === (locale === "ar" ? "rtl" : "ltr"), `${frame}: locale or direction`);
          require(rendered.dark === (colorScheme === "dark") && rendered.reduced, `${frame}: media preferences`);
          require(rendered.overflow <= 1, `${frame}: horizontal overflow`);
          await page.screenshot({ path: `output/playwright/10c4-matrix-${frame}.png` });
          if (name === "conversation") {
            await page.getByRole("button", { name: locale === "ar" ? "اقرأ كتابك" : "Read your book", exact: true }).click();
            const dialog = page.getByRole("dialog");
            const box = await dialog.boundingBox();
            const close = await dialog.getByRole("button", { name: locale === "ar" ? "إغلاق" : "Close", exact: true }).boundingBox();
            require(Math.abs(box.x + box.width / 2 - width / 2) <= 2, `${frame}: reader off center`);
            require((close.x < width / 2) === (locale === "ar"), `${frame}: reader close at wrong edge`);
            const advance = locale === "ar" ? "ArrowLeft" : "ArrowRight";
            const previous = locale === "ar" ? "ArrowRight" : "ArrowLeft";
            const pageIndicator = dialog.locator("output");
            const original = await pageIndicator.textContent();
            await page.keyboard.press(advance);
            require(await pageIndicator.textContent() !== original, `${frame}: arrow key did not advance in the UI direction`);
            await page.keyboard.press(previous);
            require(await pageIndicator.textContent() === original, `${frame}: reverse arrow key did not restore the first page`);
            await page.keyboard.press("Escape");
          }
          results.push(frame);
        }
      }
    }
  }
  require(errors.length === 0, errors.join("\n"));

  // Deliver an unnonced script and style in the served HTML, with its original
  // CSP headers. The browser's privileged evaluation only inspects the result.
  const probe = origin + "/books/new?csp-probe=1";
  const isolated = await context.browser().newContext({
    serviceWorkers: "block",
    storageState: await context.storageState(),
  });
  const probePage = await isolated.newPage();
  let intercepted = false;
  await probePage.route((url) => url.href === probe, async (route) => {
    intercepted = true;
    const response = await route.fetch();
    const headers = response.headers();
    delete headers["content-length"];
    delete headers["content-encoding"];
    const added = '<script data-csp-probe>window.__unitaleCspProbe = true</script>' +
      '<style>html:root { --unitale-unnonced-probe: blocked-test; }</style>';
    const html = await response.text();
    await route.fulfill({ status: response.status(), headers, body: html.replace("</head>", added + "</head>") });
  });
  const response = await probePage.goto(probe);
  require(intercepted, "The served-document response was not intercepted");
  await probePage.locator("script[data-csp-probe]").waitFor({ state: "attached" });
  const csp = await probePage.evaluate(() => ({
    executable: window.__unitaleCspProbe === true,
    style: getComputedStyle(document.documentElement).getPropertyValue("--unitale-unnonced-probe"),
    nonce: [...document.scripts].find((script) => script.nonce)?.nonce,
  }));
  require(!csp.executable && !csp.style && csp.nonce && response.headers()["content-security-policy"].includes(`nonce-${csp.nonce}`), "Served document CSP did not enforce its nonce");
  await isolated.close();
  await page.goto(conversation);
  return { matrix: results, productionCsp: true };
}
