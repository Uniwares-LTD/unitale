// prettier-ignore
async (page) => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const origin = "http://127.0.0.1:3102";
  const google = () =>
    page.getByRole("button", { name: "Continue with Google", exact: true });
  const ready = async (query = "?next=%2Fruns") => {
    await page.goto(origin + query);
    await google().waitFor();
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll("button")].find(
          (b) => b.textContent === "Continue with Google",
        ).disabled,
    );
  };
  for (const code of [
    "auth/popup-closed-by-user",
    "auth/cancelled-popup-request",
    "auth/popup-blocked",
    "auth/internal-error",
  ]) {
    await ready();
    const before = page.url();
    await google().click();
    assert(await google().isDisabled(), "pending must disable Google");
    await page.evaluate(
      (code) =>
        window.authFixture.reject({ code, message: "PRIVATE_PROVIDER_DETAIL" }),
      code,
    );
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll("button")].find(
          (b) => b.textContent === "Continue with Google",
        ).disabled,
    );
    const status = page.getByRole("status");
    if (code.includes("closed") || code.includes("cancelled"))
      assert((await status.count()) === 0, "cancellation must be quiet");
    else if (code.includes("blocked"))
      assert(
        (await status.innerText()).includes("Allow popups"),
        "blocked guidance missing",
      );
    else
      assert(
        !(await status.innerText()).includes("PRIVATE_PROVIDER_DETAIL"),
        "provider detail exposed",
      );
    assert(page.url() === before, "popup changed account URL");
    assert(
      (await page.evaluate(() => sessionStorage.length)) === 0,
      "popup wrote redirect state",
    );
  }
  await ready();
  const requests = [];
  const observe = (request) => {
    if (request.url().includes("/api/auth/"))
      requests.push({
        url: request.url(),
        headers: request.headers(),
        data: request.postData(),
      });
  };
  page.on("request", observe);
  await google().click();
  await google().dispatchEvent("click");
  let calls = await page.evaluate(() => window.authFixture.calls);
  assert(calls.filter((c) => c[0] === "popup").length === 1, "duplicate popup");
  assert(
    calls[0][0] === "popup" && calls[0][1] && calls[0][2],
    "popup lost activation or initialized auth",
  );
  assert(
    (await page.evaluate(() => window.authFixture.provider.prompt)) ===
      "select_account",
    "account selection missing",
  );
  await page.evaluate(() =>
    window.authFixture.resolve({ user: window.authFixture.user }),
  );
  await page.waitForFunction(() =>
    window.authFixture.calls.some((c) => c[0] === "destination"),
  );
  page.off("request", observe);
  calls = await page.evaluate(() => window.authFixture.calls);
  assert(
    calls.some((c) => c[0] === "token" && c[1] === true),
    "fresh token missing",
  );
  assert(
    calls.some((c) => c[0] === "signOut"),
    "SDK cleanup missing",
  );
  assert(
    calls.some((c) => c[0] === "destination" && c[1] === "/runs"),
    "return path missing",
  );
  assert(
    !calls.some((c) => c[0] === "redirectCredential"),
    "popup ran redirect recovery",
  );
  assert(
    (await page.evaluate(() =>
      localStorage.getItem(window.authFixture.themeKey),
    )) === "dark",
    "account appearance missing",
  );
  assert(
    requests.length === 2 &&
      requests[0].url.endsWith("/csrf") &&
      requests[1].url.endsWith("/session"),
    "existing CSRF/session exchange missing",
  );
  assert(
    requests[1].headers["x-csrf-token"] === "a".repeat(64),
    "CSRF not sent",
  );
  await ready();
  await google().click();
  await page.evaluate(() =>
    window.authFixture.resolve({
      user: { ...window.authFixture.user, emailVerified: false },
    }),
  );
  await page.getByRole("heading", { name: "Verify your email" }).waitFor();
  assert(
    !(await page.evaluate(() =>
      window.authFixture.calls.some(
        (c) => c[0] === "token" || c[0] === "destination",
      ),
    )),
    "unverified user exchanged session",
  );
  await ready("?restored=verified");
  calls = await page.evaluate(() => window.authFixture.calls);
  assert(
    calls.some((c) => c[0] === "signOut") &&
      !calls.some((c) => c[0] === "destination"),
    "popup revived stale SDK state",
  );
  await ready("?method=redirect&restored=verified");
  await page.waitForFunction(() =>
    window.authFixture.calls.some((c) => c[0] === "destination"),
  );
  assert(
    await page.evaluate(() =>
      window.authFixture.calls.some((c) => c[0] === "redirectCredential"),
    ),
    "redirect recovery removed",
  );
  await ready("?method=redirect");
  await google().click();
  await page.waitForFunction(() =>
    window.authFixture.calls.some((c) => c[0] === "redirect"),
  );
  assert(
    new URL(page.url()).searchParams.get("auth") === "google",
    "redirect URL marker missing",
  );
  assert(
    (await page.evaluate(() => sessionStorage.length)) > 0,
    "redirect storage marker missing",
  );
  console.log(
    "PASS: popup gesture/success/CSRF/session, cancellation/blocking/sanitization, duplicate guard, verified guard, stale-state cleanup, hosted redirect recovery and redirect initiation.",
  );
}
