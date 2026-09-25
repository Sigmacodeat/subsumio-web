import type { NextRequest } from "next/server";
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (handler: (req: NextRequest) => Promise<Response>) => handler,
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine",
  engineHeadersForBrain: (b: string) => ({ "x-subsumio-source": b }),
}));

import { GET } from "./route";

const call = (qs: string) =>
  GET(new Request(`http://x/api/cron/contradiction-probe${qs}`) as unknown as NextRequest);

describe("cron contradiction probe", () => {
  it("without brain_id/doc_type: 400, never probes a default brain", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      expect((await call("")).status).toBe(400);
      expect((await call("?brain_id=kanzlei-a")).status).toBe(400);
      expect((await call("?doc_type=schriftsatz")).status).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("forwards brain and doc_type to the engine", async () => {
    const fetchSpy = vi.fn(async () =>
      Response.json({ status: "ok", message: "contradiction probe completed" })
    );
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const res = await call("?brain_id=kanzlei-a&doc_type=schriftsatz");
      expect(res.status).toBe(200);
      const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
      expect((init.headers as Record<string, string>)["x-subsumio-source"]).toBe("kanzlei-a");
      expect(JSON.parse(String(init.body)).doc_type).toBe("schriftsatz");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("is not scheduled in the production crontab", () => {
    const crontab = readFileSync(join(process.cwd(), "server/deploy/netcup/crontab"), "utf8");
    const active = crontab.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
    expect(active.some((l) => l.includes("/api/cron/contradiction-probe"))).toBe(false);
  });
});
