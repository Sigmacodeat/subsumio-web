/**
 * Builds the Word and Outlook add-ins into public/ so the web app serves them
 * at the URLs their manifests point to:
 *
 *   https://subsum.io/word-addin/taskpane.html
 *   https://subsum.io/outlook-addin/taskpane.html
 *
 * plus each manifest.xml next to it (the dashboard's install page links it).
 *
 * Runs as part of `bun run build`. Uses Bun's bundler only (no add-in
 * node_modules needed in the Docker build); type checking stays in each
 * add-in's own `tsc --noEmit`. The output folders are git-ignored.
 *
 * Usage: bun scripts/build-office-addins.ts
 */

import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

interface Addin {
  name: string;
  /** The `<script>` tag in taskpane.html that loads the local entry point. */
  entryTag: RegExp;
}

const ADDINS: Addin[] = [
  { name: "word-addin", entryTag: /<script type="module" src="\.\/taskpane\.ts"><\/script>/ },
  { name: "outlook-addin", entryTag: /<script src="taskpane\.js"><\/script>/ },
];

async function buildAddin({ name, entryTag }: Addin): Promise<void> {
  const srcDir = join(ROOT, name, "src");
  const outDir = join(ROOT, "public", name);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const result = await Bun.build({
    entrypoints: [join(srcDir, "taskpane.ts")],
    target: "browser",
    format: "iife",
    minify: true,
    naming: "taskpane.js",
    outdir: outDir,
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error(`${name}: bundling taskpane.ts failed`);
  }

  const html = readFileSync(join(srcDir, "taskpane.html"), "utf8");
  if (!entryTag.test(html)) {
    throw new Error(`${name}: entry <script> tag not found in taskpane.html`);
  }
  writeFileSync(
    join(outDir, "taskpane.html"),
    html.replace(entryTag, '<script src="taskpane.js"></script>')
  );
  copyFileSync(join(ROOT, name, "manifest.xml"), join(outDir, "manifest.xml"));
  console.log(`${name}: public/${name}/{taskpane.html,taskpane.js,manifest.xml}`);
}

for (const addin of ADDINS) await buildAddin(addin);
