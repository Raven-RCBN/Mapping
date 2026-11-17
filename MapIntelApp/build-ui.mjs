import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(root, "package.json"));
const { build } = require("esbuild");
const assets = path.join(root, "android/app/src/main/assets");
await fs.mkdir(assets, { recursive: true });
await build({
  entryPoints: [path.join(root, "ui/entry.tsx")],
  bundle: true,
  minify: true,
  outfile: path.join(assets, "bundle.js"),
  format: "iife",
  jsx: "automatic",
  target: "es2020",
  nodePaths: [path.join(root, "node_modules")],
  define: {
    "import.meta.env.PROD": "false",
    "process.env.NODE_ENV": '"production"',
  },
  plugins: [
    {
      name: "native-data",
      setup(b) {
        b.onResolve(
          { filter: /\.\/data\/(map|production|imagery)\.json$/ },
          (a) => ({
            path: a.path.match(/(map|production|imagery)\.json$/)[1],
            namespace: "native-data",
          }),
        );
        b.onLoad({ filter: /.*/, namespace: "native-data" }, (a) => ({
          contents: `export default window.__MAPINTEL_DATA__.${a.path}`,
          loader: "js",
        }));
      },
    },
  ],
});
await fs.writeFile(
  path.join(assets, "index.html"),
  '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; connect-src https://overpass-api.de; frame-src \'none\'; object-src \'none\'"><title>MapIntel</title><link rel="stylesheet" href="/bundle.css"></head><body><div id="root"></div><script src="/bootstrap.js"></script><script src="/bundle.js"></script></body></html>',
);
await fs.copyFile(
  path.join(root, "android/app/src/main/res/drawable-nodpi/agrinexus_logo.png"),
  path.join(assets, "logo.png"),
);
await fs.copyFile(
  path.join(
    root,
    "android/app/src/main/res/drawable-nodpi/mapintel_wordmark.png",
  ),
  path.join(assets, "wordmark.png"),
);
console.log("Native UI bundled without mockup data or device chrome.");
