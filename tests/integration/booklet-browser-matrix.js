// prettier-ignore
// Checkpoint 10.7 matrix on a production build: dark mode, reduced motion,
// 200% zoom reflow, keyboard order and served-document CSP for booklet pages.
async (page) => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const origin = "http://127.0.0.1:3101";
  const context = page.context();
  const results = [];
  const locale = async (value) => {
    await context.clearCookies({ name: "unitale-locale" });
    await context.addCookies([{ name: "unitale-locale", value, domain: "127.0.0.1", path: "/" }]);
  };
  const noOverflow = async (label) =>
    assert(
      !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)),
      `${label}: horizontal overflow`,
    );

  // Dark mode and reduced motion (system preference; the app follows it).
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  for (const [lang, width] of [["en", 1440], ["ar", 390]]) {
    await locale(lang);
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/runs/new"]) {
      await page.goto(origin + path);
      await page.waitForLoadState("networkidle");
      assert(await page.evaluate(() => document.documentElement.classList.contains("dark")), `${path} dark`);
      assert(
        await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
        "reduced motion emulated",
      );
      await noOverflow(`${path} dark ${lang} ${width}`);
      await page.screenshot({ path: `output/playwright/booklet-dark${path.replaceAll("/", "-") || "-home"}-${lang}-${width}.png`, fullPage: true });
    }
  }
  results.push("dark mode with reduced motion: home and start, en 1440 / ar 390, no overflow");
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });

  // 200% browser zoom halves the CSS viewport (media queries follow it):
  // 1280px and 1440px windows at 200% are 640px and 720px CSS viewports.
  for (const lang of ["en", "ar"]) {
    await locale(lang);
    for (const width of [640, 720]) {
      await page.setViewportSize({ width, height: 450 });
      for (const path of ["/", "/runs/new"]) {
        await page.goto(origin + path);
        await page.waitForLoadState("networkidle");
        await noOverflow(`${path} ${lang} at 200% (${width}px)`);
      }
    }
  }
  await locale("en");
  await page.setViewportSize({ width: 720, height: 450 });
  await page.goto(origin + "/admin/booklets");
  await noOverflow("admin at 200%");
  results.push("200% zoom reflow (640/720px CSS viewports): home and start en/ar, admin");

  // Keyboard order through the start form.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + "/runs/new");
  await page.getByRole("radio").first().waitFor();
  await page.getByRole("radio").first().focus();
  const order = [];
  for (let i = 0; i < 25 && !order.includes("Review price"); i++) {
    await page.keyboard.press("Tab");
    order.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        return el?.getAttribute("aria-label") || (el?.id && document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()) || el?.textContent?.trim() || el?.tagName || "";
      }),
    );
  }
  const at = (name) => order.findIndex((entry) => entry.startsWith(name));
  assert(at("Book title") >= 0 && at("Book title") < at("Story idea") && at("Story idea") < at("Audience") && at("Audience") < at("Review price"), "keyboard order: " + order.join(" > "));
  assert(
    await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== "none" || getComputedStyle(document.activeElement).boxShadow !== "none"),
    "visible focus indicator",
  );
  results.push("keyboard reaches package, title, idea, audience then Review price with visible focus");

  // Served-document CSP: inject an un-nonced inline script and style into the
  // served HTML (keeping the server's CSP header). Privileged page evaluation is
  // not evidence; the browser must refuse the served injection itself.
  const header = await page.evaluate(async () => (await fetch("/runs/new")).headers.get("content-security-policy") ?? "");
  assert(/script-src[^;]*'nonce-/.test(header) && !/script-src[^;]*'unsafe-inline'/.test(header), "nonce script policy: " + header);
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__violations.push(e.violatedDirective));
  });
  await page.route("**/runs/new", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      /<head([^>]*)>/,
      '<head$1><script>window.__servedInjected = true</script><style>html{outline:7px solid red}</style>',
    );
    await route.fulfill({ response, body });
  });
  await page.goto(origin + "/runs/new");
  await page.waitForLoadState("networkidle");
  const probe = await page.evaluate(() => ({
    ran: window.__servedInjected === true,
    outline: getComputedStyle(document.documentElement).outlineWidth,
    violations: window.__violations,
  }));
  await page.unroute("**/runs/new");
  assert(!probe.ran, "served inline script was blocked");
  assert(probe.outline !== "7px", "served inline style was blocked");
  assert(probe.violations.some((d) => d.startsWith("script-src")), "violation reported: " + probe.violations.join(","));
  await page.getByRole("radio").first().waitFor();
  results.push("served CSP: nonce policy; injected inline script and style refused with violations reported; page still works");  return results.join(" | ");
}
