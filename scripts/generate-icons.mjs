// Render the existing project-owned vector; no generated artwork or remote assets.
import sharp from "sharp";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const svg = await readFile("src/app/icon.svg");
await mkdir("public/icons", { recursive: true });
for (const [name, size] of [
  ["icon-192", 192],
  ["icon-512", 512],
  ["apple-touch-icon", 180],
]) {
  await sharp(svg).resize(size, size).png().toFile(`public/icons/${name}.png`);
}
await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#c2410c" },
})
  .composite([
    {
      input: await sharp(svg).resize(384, 384).png().toBuffer(),
      gravity: "center",
    },
  ])
  .png()
  .toFile("public/icons/maskable-512.png");

// Browsers also request /favicon.ico independently of Next's SVG metadata.
const png = await sharp(svg).resize(32, 32).png().toBuffer();
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2); // ICO, one PNG-backed image.
ico.writeUInt16LE(1, 4);
ico[6] = 32;
ico[7] = 32;
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);
await writeFile("public/favicon.ico", Buffer.concat([ico, png]));
