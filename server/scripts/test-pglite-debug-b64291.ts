import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { cpSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const home = process.env.HOME || "/Users/msc";
const sourceDir = resolve(home, ".gbrain/brain.pglite");
const workDir = `/tmp/brain-pglite-debug-${Date.now()}`;

if (!existsSync(sourceDir)) {
  console.error("Source DB not found:", sourceDir);
  process.exit(1);
}

console.log("Copying DB to", workDir);
mkdirSync(workDir, { recursive: true });
cpSync(sourceDir, workDir, { recursive: true, preserveTimestamps: true });

for (const f of ["postmaster.pid", "postmaster.opts", "postmaster.pid.lock"]) {
  try {
    rmSync(resolve(workDir, f), { force: true });
  } catch {}
}

console.log("Opening PGLite with debug=1, relaxedDurability=true");
const db = new PGlite(workDir, {
  extensions: { vector },
  relaxedDurability: true,
  debug: 1,
} as any);

try {
  await db.waitReady;
  console.log("PGLite ready");
  const res = await db.query("SELECT version();");
  console.log("version:", res.rows[0]);
} catch (err) {
  console.error("PGLite error:", err);
  process.exit(1);
} finally {
  await db.close();
}
