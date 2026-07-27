import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { cpSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const home = process.env.HOME || "/Users/msc";
const sourceDir = resolve(home, ".gbrain/brain.pglite");
const workDir = `/tmp/brain-pglite-test-${Date.now()}`;

if (!existsSync(sourceDir)) {
  console.error("Source DB not found:", sourceDir);
  process.exit(1);
}

console.log("Copying DB to", workDir);
mkdirSync(workDir, { recursive: true });
cpSync(sourceDir, workDir, { recursive: true, preserveTimestamps: true });

// remove Postgres lock files
for (const f of ["postmaster.pid", "postmaster.opts"]) {
  try {
    rmSync(resolve(workDir, f), { force: true });
  } catch {}
}

console.log("Opening PGLite with relaxedDurability=true");
const db = new PGlite(workDir, {
  extensions: { vector, pg_trgm },
  relaxedDurability: true,
});

try {
  await db.waitReady;
  console.log("PGLite ready");
  const res = await db.query("SELECT version();");
  console.log("version:", res.rows[0]);
  const pages = await db.query("SELECT count(*) FROM pages");
  console.log("pages:", pages.rows[0]);
} catch (err) {
  console.error("PGLite error:", err);
  process.exit(1);
} finally {
  await db.close();
}
