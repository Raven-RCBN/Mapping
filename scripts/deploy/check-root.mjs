import fs from "node:fs/promises";
import assert from "node:assert/strict";
const dir = new URL("../../apps/web/dist/", import.meta.url);
const html = await fs.readFile(new URL("index.html", dir), "utf8");
assert.match(html, /src="\/assets\//);
assert.match(html, /href="\/manifest.webmanifest"/);
assert.doesNotMatch(html, /\/EstateAtlas\//);
const manifest = JSON.parse(
  await fs.readFile(new URL("manifest.webmanifest", dir), "utf8")
);
assert.equal(manifest.scope, "/");
assert.equal(manifest.start_url, "/");
assert.equal(manifest.icons[0].src, "/icon.svg");
const sw = await fs.readFile(new URL("sw.js", dir), "utf8");
assert.ok(sw.includes('const BASE = "/"'));
assert.ok(sw.includes('url.pathname.startsWith("/api/")'));
assert.ok(!sw.includes("__SHELL_FILES__"));
console.log("Mapping root assets, manifest and service-worker checks passed");
