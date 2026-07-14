import { describe, it, expect } from "vitest";
import { CORPUS_META } from "@/lib/legal-grounding";
import { collectStatutes, resolveCollisions } from "../../scripts/generate-corpus-meta";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

describe("CORPUS_META freshness", () => {
  it("matches the current generator output", { timeout: 30_000 }, () => {
    const raw = collectStatutes();
    const { entries: resolved } = resolveCollisions(raw);
    const generatedKeys = new Set(resolved.map((e) => e.slugKey));
    const currentKeys = new Set(Object.keys(CORPUS_META));

    const missingInCurrent = [...generatedKeys].filter((k) => !currentKeys.has(k));
    const extraInCurrent = [...currentKeys].filter((k) => !generatedKeys.has(k));

    if (missingInCurrent.length > 0 || extraInCurrent.length > 0) {
      const msg = [
        "CORPUS_META is stale — run: bun scripts/generate-corpus-meta.ts",
        missingInCurrent.length > 0
          ? `Missing in current meta (${missingInCurrent.length}): ${missingInCurrent.slice(0, 10).join(", ")}${missingInCurrent.length > 10 ? "..." : ""}`
          : "",
        extraInCurrent.length > 0
          ? `Extra in current meta (${extraInCurrent.length}): ${extraInCurrent.slice(0, 10).join(", ")}${extraInCurrent.length > 10 ? "..." : ""}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
      expect.fail(msg);
    }

    expect(currentKeys.size).toBeGreaterThanOrEqual(950);
  });

  it("includes the new state treaty and state law categories", () => {
    const types = new Set(Object.values(CORPUS_META).map((m) => m.type ?? "statute"));
    expect(types.has("state_treaty")).toBe(true);
    expect(types.has("state_law")).toBe(true);
    expect(types.has("statute")).toBe(true);
  });

  it("every meta file points to an existing law-corpus file", { timeout: 30_000 }, () => {
    const missing: string[] = [];
    for (const [key, meta] of Object.entries(CORPUS_META)) {
      const filePath = join(process.cwd(), "law-corpus", meta.file);
      try {
        if (!statSync(filePath).isFile()) {
          missing.push(key);
        }
      } catch {
        missing.push(key);
      }
    }
    expect(missing).toEqual([]);
  });

  it("includes at least one entry from each new directory", () => {
    const hasStaatsvertraege = Object.values(CORPUS_META).some((m) =>
      m.file.startsWith("at-staatsvertraege/")
    );
    const hasLandesrecht = Object.values(CORPUS_META).some((m) =>
      m.file.startsWith("at-landesrecht/")
    );
    expect(hasStaatsvertraege).toBe(true);
    expect(hasLandesrecht).toBe(true);
  });

  it("has no duplicate labels", () => {
    const labels = Object.values(CORPUS_META).map((m) => m.label.toUpperCase());
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });
});
