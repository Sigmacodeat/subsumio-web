// @vitest-environment node
//
// R11-8: the fallback over matter pages reads every matter (or just the
// filtered one) — and marks the answer incomplete when that read fails.
import { beforeEach, describe, expect, test, vi } from "vitest";

const list = vi.fn();
vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/engine-pages", () => ({ listEnginePages: (...a: unknown[]) => list(...a) }));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_o: unknown, handler: (ctx: unknown, b: unknown, q: unknown) => Promise<Response>) =>
    (q: unknown) =>
      handler({ headers: { "x-subsumio-source": "b" } }, {}, q),
}));

import { GET } from "./route";

const call = (q: Record<string, string> = {}) =>
  (GET as unknown as (q: unknown) => Promise<Response>)(q).then((r) => r.json());

beforeEach(() => {
  list.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ eintraege: [], zusammenfassung: { gesamt: 0 } }))
  );
});

describe("GET /api/legal/fristenbuch fallback", () => {
  test("reads every matter, complete or an error", async () => {
    list.mockResolvedValue([
      {
        slug: "legal/cases/alt",
        frontmatter: { deadlines: [{ title: "Berufung", due_date: "2030-01-01" }] },
      },
    ]);
    const body = (await call()) as { eintraege: unknown[] };
    expect(body.eintraege).toHaveLength(1);
    expect(list.mock.calls[0][2]).toBeGreaterThanOrEqual(100_000);
    expect(list.mock.calls[0][3]).toMatchObject({ strict: true, failOnTruncate: true });
  });

  test("a failed or cut matter read marks the answer partial", async () => {
    list.mockRejectedValue(new Error("list legal_case truncated at 100000"));
    const body = (await call()) as { partial?: boolean };
    expect(body.partial).toBe(true);
  });
});
