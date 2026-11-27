const extensions: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

/** Content-Disposition for an owned picture. A requested name becomes a
 * download with the real file type; without one the picture stays inline. */
export function pictureDisposition(name: string | null, mime: string) {
  const base = (name ?? "")
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (!base) return "inline";
  const extension = extensions[mime.split(";")[0].trim().toLowerCase()];
  const file = extension ? `${base}.${extension}` : base;
  // ASCII fallback for old clients; filename* carries the real (e.g. Arabic) name.
  const ascii = file.replace(/[^\x20-\x7e]/g, "_").replace(/%/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

