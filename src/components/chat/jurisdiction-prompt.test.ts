import { describe, expect, it } from "vitest";
import {
  buildClientCollisionWarningSection,
  buildClientJurisdictionPromptSection,
} from "@/components/chat/jurisdiction-prompt";

describe("compact chat jurisdiction prompt", () => {
  it("keeps Austrian and German KSchG meanings separated", () => {
    expect(buildClientCollisionWarningSection("at")).toContain("Konsumentenschutzgesetz");
    expect(buildClientCollisionWarningSection("at")).not.toContain(
      "KSchG = Kündigungsschutzgesetz"
    );
    expect(buildClientCollisionWarningSection("de")).toContain("Kündigungsschutzgesetz");
  });

  it("requires retrieved evidence instead of presenting the shortlist as exhaustive", () => {
    const prompt = buildClientJurisdictionPromptSection("at");
    expect(prompt).toContain("nicht abschließend");
    expect(prompt).toContain("Retrieval-Kontext tatsächlich geliefert");
    expect(prompt).toContain("ABGB");
    expect(prompt).toContain("BGB");
  });

  it("stays compact enough for every chat request", () => {
    for (const jurisdiction of ["de", "at", "ch", "eu"] as const) {
      expect(buildClientJurisdictionPromptSection(jurisdiction).length).toBeLessThan(1_500);
    }
  });
});
