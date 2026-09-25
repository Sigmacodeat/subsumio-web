import type { NextRequest } from "next/server";
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// The scheduler entry point starts nothing: the case scan runs on demand only.
vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (handler: (req: NextRequest) => Promise<Response>) => handler,
}));

import { GET } from "./route";

describe("cron case scanner", () => {
  it("answers 'deactivated' and never reaches the engine", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const res = await GET(new Request("http://x/api/cron/case-scanner") as unknown as NextRequest);
      expect(res.status).toBe(410);
      const body = (await res.json()) as { disabled: boolean; message: string };
      expect(body.disabled).toBe(true);
      expect(body.message).toContain("deaktiviert");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
