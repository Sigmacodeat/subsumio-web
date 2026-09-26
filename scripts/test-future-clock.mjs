#!/usr/bin/env node
// Runs the web unit suite with the wall clock moved forward (default +400 days,
// Europe/Vienna) so a test that compares fixed calendar dates with the real
// "now" fails today, not on the day its date passes. See docs/TESTING.md.
//
//   node scripts/test-future-clock.mjs [vitest args…]
//   CLOCK_SHIFT_DAYS=30 node scripts/test-future-clock.mjs src/lib
//   CLOCK_SHIFT_TO=2027-01-01T00:30:00+01:00 node scripts/test-future-clock.mjs
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const preload = path.join(path.dirname(fileURLToPath(import.meta.url)), "test-clock-shift.cjs");
const env = {
  ...process.env,
  TZ: process.env.TZ || "Europe/Vienna",
  // Absolute path: child processes (smoke tests spawn scripts via bunx/tsx)
  // run from other working directories.
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require ${preload}`.trim(),
};
if (!env.CLOCK_SHIFT_TO && !env.CLOCK_SHIFT_DAYS) env.CLOCK_SHIFT_DAYS = "400";

const res = spawnSync("npx", ["vitest", "run", ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});
process.exit(res.status ?? 1);
