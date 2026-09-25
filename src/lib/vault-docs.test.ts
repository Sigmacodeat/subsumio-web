import { beforeEach, describe, expect, test, vi } from "vitest";

const listAllPages = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { brain: { listAllPages: (...a: unknown[]) => listAllPages(...a) } },
}));

import { listVaultPages, VAULT_TYPE_MAX } from "./vault-docs";

function pages(type: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    slug: `${type}/${i}`,
    title: `${type} ${i}`,
    type,
  }));
}

describe("listVaultPages", () => {
  beforeEach(() => {
    listAllPages.mockReset();
  });

  test("loads documents by type, so other records cannot crowd them out", async () => {
    // 150 documents; the firm also has 300 deadlines/time entries, which are
    // no longer part of the vault listing at all.
    listAllPages.mockImplementation(async ({ type }: { type: string }) =>
      type === "document" ? pages("document", 150) : []
    );
    const { pages: docs, capped } = await listVaultPages();
    expect(docs).toHaveLength(150);
    expect(capped).toBe(false);
    for (const [arg] of listAllPages.mock.calls) {
      expect((arg as { type?: string }).type).toBeTruthy();
    }
  });

  test("reports a cut list when a type reaches the bound", async () => {
    listAllPages.mockImplementation(async ({ type }: { type: string }) =>
      type === "document" ? pages("document", VAULT_TYPE_MAX) : []
    );
    expect((await listVaultPages()).capped).toBe(true);
  });

  test("a failed load is an error, not an empty vault", async () => {
    listAllPages.mockRejectedValue(new Error("down"));
    await expect(listVaultPages()).rejects.toThrow();
  });
});
