/**
 * `gbrain pages …` must reach the pages dispatcher. The command existed in
 * handleCliOnly's switch but was missing from CLI_ONLY, so every call —
 * including the operator commands audit-agent-writes and backfill-case-slug —
 * died as "Unknown command" before the switch. Unit tests that call runPages()
 * directly could not see that; this spawns the real CLI.
 */
import { describe, expect, it } from "bun:test";

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exit: number }> {
  const proc = Bun.spawn(["bun", "run", "src/cli.ts", "pages", ...args], {
    cwd: new URL("..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, DATABASE_URL: "", GBRAIN_DATABASE_URL: "" },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { stdout, stderr, exit: await proc.exited };
}

describe("gbrain pages — CLI registration", () => {
  it("is dispatched, not rejected as an unknown command", async () => {
    const { stderr } = await runCli(["--help"]);
    expect(stderr).not.toContain("Unknown command");
  }, 30000);

});
