// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";

const pages = new Map<string, { frontmatter: Record<string, unknown> }>();
vi.mock("@/lib/server-brain", () => ({
  createServerBrainClient: () => ({
    getPage: async (slug: string) => {
      const p = pages.get(slug);
      if (!p) throw new Error("not found");
      return p;
    },
    updatePage: async (p: { slug: string; frontmatter: Record<string, unknown> }) => {
      pages.set(p.slug, { frontmatter: p.frontmatter });
      return { slug: p.slug };
    },
    createPage: async (p: { slug: string; frontmatter: Record<string, unknown> }) => {
      pages.set(p.slug, { frontmatter: p.frontmatter });
      return { slug: p.slug };
    },
  }),
}));
vi.mock("@/lib/logger", () => ({ logger: () => ({ warn: vi.fn(), error: vi.fn() }) }));

import { allocateCaseNumber } from "./case-numbering";

afterEach(() => {
  vi.useRealTimers();
  pages.clear();
});

describe("allocateCaseNumber (audit QA-6)", () => {
  test("00:30 Vienna on 1 January numbers in the new year", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-31T23:30:00Z"));
    pages.set("legal/settings/case-number-counter", { frontmatter: { year: 2026, next: 57 } });
    expect(await allocateCaseNumber({}, "")).toBe("27-0001");
  });
});
