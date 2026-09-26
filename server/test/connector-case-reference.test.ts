import { describe, expect, it } from "bun:test";
import {
  resolveExactConnectorCase,
  sameCaseReference,
} from "../src/core/minions/handlers/ingest-capture.ts";

function engineWith(cases: Array<{ slug: string; case_number: string }>) {
  const calls: Array<{ offset?: number; sourceId?: string }> = [];
  return {
    calls,
    engine: {
      listPages: async (f?: { offset?: number; limit?: number; sourceId?: string }) => {
        calls.push({ offset: f?.offset, sourceId: f?.sourceId });
        const off = f?.offset ?? 0;
        return cases
          .slice(off, off + (f?.limit ?? 100))
          .map((c) => ({ slug: c.slug, frontmatter: { case_number: c.case_number } })) as never;
      },
    },
  };
}

describe("sameCaseReference", () => {
  it("Geschäftszahl tolerant of spacing/case, Prüfbuchstabe respected", () => {
    expect(sameCaseReference("12 Cg 34/25x", "12Cg34/25X")).toBe(true);
    expect(sameCaseReference("12 Cg 34/25", "12 Cg 34/25x")).toBe(true);
    expect(sameCaseReference("1 Cg 3/25a", "1 Cg 3/25b")).toBe(false);
    expect(sameCaseReference("1 Cg 3/25a", "11 Cg 3/25a")).toBe(false);
  });
});

describe("resolveExactConnectorCase", () => {
  it("finds a matter beyond the first 500 in the firm's own source", async () => {
    const cases = Array.from({ length: 700 }, (_, i) => ({
      slug: `legal/cases/a${i}`,
      case_number: `${i} C ${i}/25`,
    }));
    cases.push({ slug: "legal/cases/ziel", case_number: "10 Cg 12/26x" });
    const { engine, calls } = engineWith(cases);
    const slug = await resolveExactConnectorCase(engine, "firm-a", {
      metadata: { case_reference: "10 Cg 12/26x" },
    });
    expect(slug).toBe("legal/cases/ziel");
    expect(calls.every((c) => c.sourceId === "firm-a")).toBe(true);
  });

  it("two matters with the same number: no automatic assignment", async () => {
    const { engine } = engineWith([
      { slug: "legal/cases/a", case_number: "10 Cg 12/26x" },
      { slug: "legal/cases/b", case_number: "10Cg12/26x" },
    ]);
    expect(
      await resolveExactConnectorCase(engine, "firm-a", {
        metadata: { case_reference: "10 Cg 12/26x" },
      })
    ).toBeUndefined();
  });
});
