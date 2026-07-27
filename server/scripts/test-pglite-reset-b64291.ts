import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";

const workDir = "/tmp/brain-pglite-debug-1784873872899";

console.log("Opening PGLite from", workDir);
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
  const pages = await db.query("SELECT count(*) FROM pages");
  console.log("pages:", pages.rows[0]);
} catch (err) {
  console.error("PGLite error:", err);
  process.exit(1);
} finally {
  await db.close();
}
