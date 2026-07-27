import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const workDir = "/tmp/pglite-fresh-test-b64291";
if (existsSync(workDir)) {
  rmSync(workDir, { recursive: true, force: true });
}

console.log("Creating fresh PGLite DB at", workDir);
const db = new PGlite(workDir, {
  extensions: { vector },
});

try {
  await db.waitReady;
  console.log("Fresh PGLite ready");
  const res = await db.query("SELECT version();");
  console.log("version:", res.rows[0]);
  await db.exec("CREATE TABLE test (id serial primary key, name text);");
  await db.exec("INSERT INTO test (name) VALUES ('hello');");
  const rows = await db.query("SELECT * FROM test");
  console.log("rows:", rows.rows);
} catch (err) {
  console.error("Fresh PGLite error:", err);
  process.exit(1);
} finally {
  await db.close();
}
