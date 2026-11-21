import fs from "node:fs";
const project = JSON.parse(fs.readFileSync("project.config.json", "utf8"));
const recovery = JSON.parse(fs.readFileSync("messages/recovery.json", "utf8"));
const escape = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const html = `<!doctype html>
<html lang="${project.defaultLocale}" dir="${project.defaultLocale === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#c2410c"><title>${escape(recovery[project.defaultLocale].offline)}</title><style>body{margin:0;background:#fff9f3;color:#30221d;font:1rem/1.6 system-ui,sans-serif}main{max-width:32rem;margin:20vh auto;padding:2rem}a{color:#c2410c;text-underline-offset:.2em}a:focus-visible{outline:3px solid #c2410c;outline-offset:5px}</style><script src="/offline-locale.js?namespace=${encodeURIComponent(project.slug)}" defer></script></head><body><main><h1 id="heading">${escape(recovery[project.defaultLocale].offline)}</h1><p id="help">${escape(recovery[project.defaultLocale].offlineHelp)}</p><p><a id="retry" href="/">${escape(recovery[project.defaultLocale].retry)}</a></p></main></body></html>
`;
const script = `/* Generated from reviewed public recovery catalogs; no account data. */
(()=>{const copy=${JSON.stringify(recovery)};let locale=${JSON.stringify(project.defaultLocale)};try{const saved=localStorage.getItem(${JSON.stringify(project.slug + "-offline-locale")});if(${JSON.stringify(project.locales)}.includes(saved))locale=saved;}catch{}const text=copy[locale];document.documentElement.lang=locale;document.documentElement.dir=locale==="ar"?"rtl":"ltr";document.title=text.offline;document.getElementById("heading").textContent=text.offline;document.getElementById("help").textContent=text.offlineHelp;document.getElementById("retry").textContent=text.retry;})();
`;
for (const [file, content] of [
  ["public/offline.html", html],
  ["public/offline-locale.js", script],
]) {
  if (process.argv.includes("--check")) {
    if (fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n") !== content)
      throw new Error(`${file} is stale`);
  } else fs.writeFileSync(file, content);
}
