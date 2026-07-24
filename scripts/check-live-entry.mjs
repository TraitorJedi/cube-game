import { readFile } from "node:fs/promises";

const rootHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
const legacyHtml = await readFile(new URL("../legacy.html", import.meta.url), "utf8");

if (!/<script\b[^>]*\bsrc=["']\/src\/main\.js["']/i.test(rootHtml)) {
  throw new Error("The production page must load the React entry at /src/main.js.");
}

if (/<script\b[^>]*\bsrc=["'][^"']*app\.js["']/i.test(rootHtml)) {
  throw new Error("The production page must not load the legacy app.js implementation.");
}

if (!/<script\b[^>]*\bsrc=["']\/legacy\/app\.js["']/i.test(legacyHtml)) {
  throw new Error("The /legacy page must load the preserved legacy/app.js implementation.");
}

if (/<script\b[^>]*\bsrc=["'][^"']*src\/main\.js["']/i.test(legacyHtml)) {
  throw new Error("The /legacy page must not load the React implementation.");
}
