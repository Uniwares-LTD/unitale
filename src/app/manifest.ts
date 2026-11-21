import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { publicSettings } from "@/lib/server/settings";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  await connection();
  const { appName } = await publicSettings();
  return {
    id: "/",
    name: appName,
    short_name: appName,
    description: (await getTranslations("common"))("description", {
      name: appName,
    }),
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fff9f3",
    theme_color: "#c2410c",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
