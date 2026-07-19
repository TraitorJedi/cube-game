import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

if (!/<script\b[^>]*\bsrc=["'](?:\.\/)?app\.js["']/i.test(html)) {
  throw new Error("The production page must load app.js until the React replacement has passed the parity checklist.");
}

if (/<script\b[^>]*\bsrc=["'](?:\.?\/)?src\/main\.js["']/i.test(html)) {
  throw new Error("index.html must not load both game implementations. app.js is the current production source of truth.");
}
