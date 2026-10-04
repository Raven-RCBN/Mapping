import { createRequire } from "node:module";
import fs from "node:fs/promises";
const require = createRequire(import.meta.url),
  webRequire = createRequire(
    require.resolve("../apps/web/node_modules/vite/package.json")
  ),
  { build } = webRequire("esbuild");
const result = await build({
  entryPoints: ["apps/mobile/viewer/index.js"],
  bundle: true,
  minify: true,
  write: false,
  outfile: "viewer.js",
  nodePaths: ["apps/web/node_modules"],
  format: "iife",
});
const js = result.outputFiles.find((f) => f.path.endsWith(".js")).text,
  css = result.outputFiles.find((f) => f.path.endsWith(".css")).text;
const shell = (await fs.readFile("apps/mobile/viewer/shell.html", "utf8"))
  .replace("__SCRIPT__", () => js.replaceAll("</script", "<\\/script"))
  .replace("__STYLE__", () => css);
await fs.mkdir("apps/mobile/assets", { recursive: true });
await fs.writeFile(
  "apps/mobile/assets/viewer.json",
  JSON.stringify({ html: shell })
);
console.log(
  "Bundled offline viewer:",
  shell.length,
  "bytes; no external dependencies."
);
