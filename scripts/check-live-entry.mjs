import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

if (!html.includes('src="app.js"')) {
  throw new Error("The production page must load app.js. Update the live entry point or migrate it intentionally before changing game behavior.");
}

if (html.includes('src="src/main.js"')) {
  throw new Error("index.html must not load both game implementations. app.js is the current production source of truth.");
}
