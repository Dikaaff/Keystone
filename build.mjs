// Bundles the Custom UI once, with no runtime asset fetching from outside Atlassian.
// The static output is what Forge serves from the `keystone-ui` resource.
import { build } from 'esbuild';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';

const OUT_DIR = 'static/radar/build';

await mkdir(OUT_DIR, { recursive: true });

await build({
  entryPoints: ['src/ui/index.jsx'],
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'iife',
  target: ['es2019'],
  jsx: 'automatic',
  outfile: `${OUT_DIR}/main.js`,
  loader: { '.css': 'css' },
  logLevel: 'info',
});

// esbuild emits a sibling stylesheet when a CSS file is imported from the entry point.
await copyFile('src/ui/styles.css', `${OUT_DIR}/main.css`).catch(() => {});

await writeFile(
  `${OUT_DIR}/index.html`,
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Keystone — Knowledge Risk Radar</title>
    <link rel="stylesheet" href="./main.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="./main.js"></script>
  </body>
</html>
`,
);

console.log(`Built Custom UI into ${OUT_DIR}`);
