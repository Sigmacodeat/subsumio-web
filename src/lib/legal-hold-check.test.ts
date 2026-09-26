// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { checkFirmLegalHolds } from "./legal-hold-check";

function fakeFetch(impl: (url: string) => Promise<Response> | Response) {
  return vi.fn(async (url: string) => impl(url)) as unknown as typeof fetch;
}

describe("checkFirmLegalHolds", () => {
  it("returns clear when no matter carries legal_hold", async () => {
    const fetchImpl = fakeFetch(
      () =>
        new Response(
          JSON.stringify([
            { slug: "legal/a", frontmatter: { legal_hold: false } },
            { slug: "legal/b", frontmatter: {} },
          ]),
          { status: 200 }
        )
    );
    expect(await checkFirmLegalHolds({}, fetchImpl)).toEqual({ status: "clear" });
  });

  it("returns held with the exact case slugs when any matter is under hold", async () => {
    const fetchImpl = fakeFetch(
      () =>
        new Response(
          JSON.stringify([
            { slug: "legal/a", frontmatter: { legal_hold: true } },
            { slug: "legal/b", frontmatter: { legal_hold: false } },
            { slug: "legal/c", frontmatter: { legal_hold: true } },
          ]),
          { status: 200 }
        )
    );
    expect(await checkFirmLegalHolds({}, fetchImpl)).toEqual({
      status: "held",
      cases: ["legal/a", "legal/c"],
    });
  });

  it("fails closed (unknown) on a non-OK response — never proves absence of a hold", async () => {
    const fetchImpl = fakeFetch(() => new Response("", { status: 500 }));
    expect(await checkFirmLegalHolds({}, fetchImpl)).toEqual({ status: "unknown" });
  });

  it("fails closed (unknown) when the engine call throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    expect(await checkFirmLegalHolds({}, fetchImpl)).toEqual({ status: "unknown" });
  });

  it("pages via x-next-cursor and finds a hold beyond the first 100 cases", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const cursor = new URL(url).searchParams.get("cursor");
      if (!cursor) {
        const rows = Array.from({ length: 100 }, (_, i) => ({
          slug: `legal/c${i}`,
          frontmatter: {},
        }));
        return new Response(JSON.stringify(rows), {
          status: 200,
          headers: { "x-next-cursor": "2026-01-01T00:00:00Z|last" },
        });
      }
      return new Response(
        JSON.stringify([{ slug: "legal/held", frontmatter: { legal_hold: true } }]),
        { status: 200 }
      );
    }) as unknown as typeof fetch;
    expect(await checkFirmLegalHolds({}, fetchImpl)).toEqual({
      status: "held",
      cases: ["legal/held"],
    });
  });

  it("fails closed when a full batch comes back without a cursor (engine without header)", async () => {
    const fetchImpl = fakeFetch(
      () =>
        new Response(
          JSON.stringify(
            Array.from({ length: 100 }, (_, i) => ({ slug: `legal/c${i}`, frontmatter: {} }))
          ),
          { status: 200 }
        )
    );
    // 100 rows and no cursor metadata: the list may continue — never "clear".
    expect(await checkFirmLegalHolds({}, fetchImpl)).toEqual({ status: "unknown" });
  });

  it("forwards the given headers to the engine call", async () => {
    const seen: Record<string, string>[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push(init?.headers as Record<string, string>);
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch;
    await checkFirmLegalHolds({ "x-subsumio-source": "brain_a" }, fetchImpl);
    expect(seen[0]).toEqual({ "x-subsumio-source": "brain_a" });
  });
});
