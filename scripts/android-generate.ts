import { project } from "../src/lib/project";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { TwaGenerator, TwaManifest, ConsoleLog } from "@bubblewrap/core";
import { parseAndroidConfig } from "./android-config";
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd(), false);
  const config = parseAndroidConfig(
    JSON.parse(await readFile("android/config.json", "utf8")),
    {
      ...process.env,
      ANDROID_PACKAGE_NAME:
        process.env.ANDROID_PACKAGE_NAME || project.android?.packageName,
    },
    process.argv.includes("--release"),
  );
  // Bubblewrap fetches icons: serve only our two versioned public images locally,
  // so generation never depends on the production website being deployed.
  const server = createServer(async (req, res) => {
    const file =
      req.url === "/icon.png"
        ? "icon-512.png"
        : req.url === "/maskable.png"
          ? "maskable-512.png"
          : null;
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    try {
      res.setHeader("Content-Type", "image/png");
      res.end(await readFile(`public/icons/${file}`));
    } catch {
      res.writeHead(500).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Icon server unavailable.");
    const base = `http://127.0.0.1:${address.port}`;
    const manifest = new TwaManifest({
      packageId: config.packageId,
      host: config.host,
      name: project.displayName,
      launcherName: project.displayName,
      display: "standalone",
      themeColor: "#98492f",
      navigationColor: "#fff9f3",
      backgroundColor: "#fff9f3",
      enableNotifications: true,
      enableSiteSettingsShortcut: false,
      startUrl: "/?client=play",
      splashScreenFadeOutDuration: 0,
      iconUrl: `${base}/icon.png`,
      maskableIconUrl: `${base}/maskable.png`,
      signingKey: { path: "upload.keystore", alias: project.slug },
      appVersionCode: config.versionCode,
      appVersion: config.versionName,
      generatorApp: "bubblewrap-1.25.0",
      fallbackType: "customtabs",
      minSdkVersion: 24,
      shortcuts: [],
      features: { playBilling: { enabled: true } },
      additionalTrustedOrigins: [],
    });
    await mkdir("android/project", { recursive: true });
    await new TwaGenerator().createTwaProject(
      "android/project",
      manifest,
      new ConsoleLog(project.slug),
    );
    const androidManifestPath =
      "android/project/app/src/main/AndroidManifest.xml";
    const generatedManifest = await readFile(androidManifestPath, "utf8");
    const upstreamActivity =
      "com.google.androidbrowserhelper.playbilling.provider.PaymentActivity";
    if (generatedManifest.split(upstreamActivity).length !== 2)
      throw new Error(
        "Review the generated Play billing activity before adapting it.",
      );
    await writeFile(
      androidManifestPath,
      generatedManifest.replace(
        upstreamActivity,
        "com.google.androidbrowserhelper.playbilling.provider.CatalogPaymentActivity",
      ),
    );
    const billingSource =
      "android/project/app/src/main/java/com/google/androidbrowserhelper/playbilling/provider";
    await mkdir(billingSource, { recursive: true });
    await writeFile(
      `${billingSource}/CatalogPaymentActivity.java`,
      await readFile("android/billing/CatalogPaymentActivity.java", "utf8"),
    );
    manifest.iconUrl = `https://${config.host}/icons/icon-512.png`;
    manifest.maskableIconUrl = `https://${config.host}/icons/maskable-512.png`;
    manifest.webManifestUrl = new URL(
      `https://${config.host}/manifest.webmanifest`,
    );
    await manifest.saveToFile("android/project/twa-manifest.json");
    const buildFile = "android/project/build.gradle";
    const generatedBuild = await readFile(buildFile, "utf8");
    const upstreamPlugin = "com.android.tools.build:gradle:8.9.1";
    // Bubblewrap 1.25.0 targets API 36, but its AGP 8.9 template only supports
    // API 35. AGP 8.10 supports 36 with the same Gradle 8.11.1 / Java 17 setup.
    if (!generatedBuild.includes(upstreamPlugin))
      throw new Error(
        "Bubblewrap Gradle plugin changed; review the API 36 adaptation.",
      );
    await writeFile(
      buildFile,
      generatedBuild
        .replace(upstreamPlugin, "com.android.tools.build:gradle:8.10.1")
        .replaceAll("jcenter()", "mavenCentral()"),
    );
    await writeFile(
      "android/project/app/build.gradle",
      (await readFile("android/project/app/build.gradle", "utf8")) +
        '\ndependencies { implementation "com.android.billingclient:billing:8.3.0" }\napply from: "../../release-signing.gradle"\n',
    );
    console.log(
      "Generated Android project from environment identity and android/config.json version. No signing keys created.",
    );
  } finally {
    server.closeAllConnections();
    server.close();
  }
}
main().catch((error: unknown) => {
  console.error(
    "Android generation failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
});
