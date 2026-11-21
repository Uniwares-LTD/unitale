// Browser smoke check for the design-system adoption (#53). Run after every remaining step.
//
//   PLAYWRIGHT_MODULE=<path to playwright-core> CHROMIUM_PATH=<Edge or Chrome executable> \
//     node docs/features/design-system-adoption/smoke.mjs
//
// Needs the app on http://localhost:3000 (npm run dev) with the local services from
// docs/local-testing.md. Uses an existing Playwright installation; adds no dependency.
// Checks public pages only: every preset and theme loads, the preset attribute is applied,
// Arabic is right-to-left, nothing overflows at 390px, and there are no console errors.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
const APP = process.env.APP_URL ?? "http://localhost:3000";
const pages = ["/", "/design-system"];
const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${pass ? "" : ` ${JSON.stringify(detail)}`}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
});
try {
  for (const style of ["classic", "glass", "soft-blue"])
    for (const theme of ["light", "dark"])
      for (const width of [1440, 390]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        await context.addCookies([{ name: "unibase-style", value: style, url: APP }]);
        await context.addInitScript((t) => localStorage.setItem("unibase-theme", t), theme);
        const page = await context.newPage();
        const errors = [];
        page.on("console", (m) => {
          if (m.type() === "error" && !/status of 404/.test(m.text())) errors.push(m.text());
        });
        page.on("pageerror", (e) => errors.push(String(e)));
        page.on("response", (r) => {
          // The showcase's failed-image example requests a deliberately missing file.
          if (r.status() >= 400 && !r.url().includes("__design-system-missing-image"))
            errors.push(`${r.status()} ${r.url()}`);
        });
        for (const path of pages) {
          const response = await page.goto(APP + path, { waitUntil: "networkidle" });
          const state = await page.evaluate(() => ({
            style: document.documentElement.dataset.style,
            dark: document.documentElement.classList.contains("dark"),
            overflow: document.documentElement.scrollWidth - innerWidth,
          }));
          check(
            `${path} ${style} ${theme} ${width}`,
            response?.status() === 200 &&
              state.style === style &&
              state.dark === (theme === "dark") &&
              state.overflow <= 0,
            { status: response?.status(), ...state },
          );
        }
        check(`no console errors ${style} ${theme} ${width}`, errors.length === 0, errors);
        await context.close();
      }
  const arabic = await browser.newContext();
  await arabic.addCookies([{ name: "unibase-locale", value: "ar", url: APP }]);
  const page = await arabic.newPage();
  await page.goto(APP + "/", { waitUntil: "networkidle" });
  check("Arabic home is right-to-left", (await page.evaluate(() => document.documentElement.dir)) === "rtl");
  const missing = await page.goto(APP + "/this-page-does-not-exist");
  check("not-found page answers 404", missing?.status() === 404);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
