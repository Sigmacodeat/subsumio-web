import { describe, it, expect } from "bun:test";

// Test the jurisdiction-aware draft packages logic.
// We re-implement the lookup here for behavioral testing.

type Jurisdiction = "at" | "de" | "ch" | "eu";

interface DraftPackage {
  type: string;
  title: string;
}

const DRAFT_PACKAGES_BY_JURISDICTION: Record<Jurisdiction, DraftPackage[]> = {
  at: [
    { type: "ahg_antrag", title: "AHG-Antrag (§ 8 AHG an Finanzprokuratur)" },
    { type: "strafantrag", title: "Strafantrag (§ 28 StPO an STA)" },
    { type: "einspruch", title: "Einspruch (§ 106 StPO)" },
    { type: "dsgvo_beschwerde", title: "DSGVO-Beschwerde (Art 82 DSGVO)" },
    { type: "klage_entwurf", title: "Klageentwurf (AHG-Klage LG ZRS)" },
    { type: "versand_checkliste", title: "Versand-Checkliste" },
  ],
  de: [
    { type: "amtshaftung_anspruch", title: "Amtshaftungsanspruch (§ 839 BGB i.V.m. Art 34 GG)" },
    { type: "strafanzeige", title: "Strafanzeige (§ 158 StPO an STA)" },
    { type: "widerspruch", title: "Widerspruch (§ 69 VwGO)" },
    { type: "dsgvo_beschwerde", title: "DSGVO-Beschwerde (Art 82 DSGVO)" },
    { type: "klage_entwurf", title: "Klageentwurf (Landgericht Zivilkammer)" },
    { type: "versand_checkliste", title: "Versand-Checkliste" },
  ],
  ch: [
    { type: "staatshaftung", title: "Staatshaftungsanspruch (Art 61 BV)" },
    { type: "strafanzeige", title: "Strafanzeige (Art 118 StPO an Staatsanwaltschaft)" },
    { type: "beschwerde", title: "Beschwerde (Art 80 BGG)" },
    { type: "dsgvo_beschwerde", title: "DSGVO-Beschwerde (Art 82 DSGVO / nDSG)" },
    { type: "klage_entwurf", title: "Klageentwurf (Bezirks-/Kantonsgericht)" },
    { type: "versand_checkliste", title: "Versand-Checkliste" },
  ],
  eu: [
    { type: "eu_beschwerde", title: "EU-Beschwerde (an EU-Institution)" },
    { type: "dsgvo_beschwerde", title: "DSGVO-Beschwerde (Art 82 DSGVO)" },
    { type: "menschrechts_beschwerde", title: "EMRK-Beschwerde (Art 13 EMRK)" },
    { type: "versand_checkliste", title: "Versand-Checkliste" },
  ],
};

describe("jurisdiction-aware drafts", () => {
  it("AT: has AHG-Antrag, Strafantrag, Einspruch", () => {
    const types = DRAFT_PACKAGES_BY_JURISDICTION.at.map((p) => p.type);
    expect(types).toContain("ahg_antrag");
    expect(types).toContain("strafantrag");
    expect(types).toContain("einspruch");
    expect(types).toContain("klage_entwurf");
    expect(types).toContain("versand_checkliste");
  });

  it("DE: has Amtshaftung (§ 839 BGB), Strafanzeige, Widerspruch", () => {
    const types = DRAFT_PACKAGES_BY_JURISDICTION.de.map((p) => p.type);
    expect(types).toContain("amtshaftung_anspruch");
    expect(types).toContain("strafanzeige");
    expect(types).toContain("widerspruch");
    expect(types).toContain("klage_entwurf");
    expect(types).not.toContain("ahg_antrag"); // AT-specific
  });

  it("CH: has Staatshaftung (Art 61 BV), Beschwerde", () => {
    const types = DRAFT_PACKAGES_BY_JURISDICTION.ch.map((p) => p.type);
    expect(types).toContain("staatshaftung");
    expect(types).toContain("beschwerde");
    expect(types).toContain("strafanzeige");
    expect(types).not.toContain("ahg_antrag"); // AT-specific
    expect(types).not.toContain("amtshaftung_anspruch"); // DE-specific
  });

  it("EU: has EU-Beschwerde, EMRK-Beschwerde", () => {
    const types = DRAFT_PACKAGES_BY_JURISDICTION.eu.map((p) => p.type);
    expect(types).toContain("eu_beschwerde");
    expect(types).toContain("menschrechts_beschwerde");
    expect(types).toContain("dsgvo_beschwerde");
  });

  it("All jurisdictions have DSGVO-Beschwerde", () => {
    for (const j of ["at", "de", "ch", "eu"] as Jurisdiction[]) {
      const types = DRAFT_PACKAGES_BY_JURISDICTION[j].map((p) => p.type);
      expect(types).toContain("dsgvo_beschwerde");
    }
  });

  it("All jurisdictions have Versand-Checkliste", () => {
    for (const j of ["at", "de", "ch", "eu"] as Jurisdiction[]) {
      const types = DRAFT_PACKAGES_BY_JURISDICTION[j].map((p) => p.type);
      expect(types).toContain("versand_checkliste");
    }
  });

  it("AT and DE both have 6 packages, EU has 4", () => {
    expect(DRAFT_PACKAGES_BY_JURISDICTION.at.length).toBe(6);
    expect(DRAFT_PACKAGES_BY_JURISDICTION.de.length).toBe(6);
    expect(DRAFT_PACKAGES_BY_JURISDICTION.ch.length).toBe(6);
    expect(DRAFT_PACKAGES_BY_JURISDICTION.eu.length).toBe(4);
  });
});

// Test counter-argument extraction logic

interface CounterArgument {
  target_draft: string;
  weakness_type: string;
  argument: string;
  severity: "kritisch" | "hoch" | "mittel" | "niedrig";
}

function extractCounterArguments(json: unknown): CounterArgument[] {
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;
  const ca = obj.counter_arguments;
  if (!Array.isArray(ca)) return [];
  return ca
    .filter((c) => typeof c === "object" && c !== null)
    .map((c) => {
      const o = c as Record<string, unknown>;
      return {
        target_draft: String(o.target_draft ?? ""),
        weakness_type: String(o.weakness_type ?? ""),
        argument: String(o.argument ?? ""),
        severity: (o.severity === "kritisch" ||
        o.severity === "hoch" ||
        o.severity === "mittel" ||
        o.severity === "niedrig"
          ? o.severity
          : "mittel") as CounterArgument["severity"],
      };
    });
}

describe("counter-argument extraction", () => {
  it("extracts valid counter-arguments", () => {
    const json = {
      counter_arguments: [
        {
          target_draft: "ahg_antrag",
          weakness_type: "beweis_luecke",
          argument: "Missing quote for § 8 AHG",
          severity: "hoch",
        },
        {
          target_draft: "klage_entwurf",
          weakness_type: "verjaehrung",
          argument: "Claim may be time-barred",
          severity: "kritisch",
        },
      ],
    };
    const result = extractCounterArguments(json);
    expect(result.length).toBe(2);
    expect(result[0]!.target_draft).toBe("ahg_antrag");
    expect(result[0]!.severity).toBe("hoch");
    expect(result[1]!.severity).toBe("kritisch");
  });

  it("defaults severity to 'mittel' when invalid", () => {
    const json = {
      counter_arguments: [
        {
          target_draft: "ahg_antrag",
          weakness_type: "test",
          argument: "test",
          severity: "invalid",
        },
      ],
    };
    const result = extractCounterArguments(json);
    expect(result[0]!.severity).toBe("mittel");
  });

  it("returns empty array when counter_arguments missing", () => {
    const json = { overall_assessment: "test" };
    const result = extractCounterArguments(json);
    expect(result).toEqual([]);
  });

  it("returns empty array for null input", () => {
    const result = extractCounterArguments(null);
    expect(result).toEqual([]);
  });
});

// Test deadline validation extraction

describe("deadline validation extraction", () => {
  function extractDeadlineValidation(json: unknown) {
    const obj = json as Record<string, unknown>;
    if (!obj) return null;
    return {
      validated_deadlines: Array.isArray(obj.validated_deadlines) ? obj.validated_deadlines : [],
      missing_deadlines: Array.isArray(obj.missing_deadlines) ? obj.missing_deadlines : [],
      overall_assessment: String(obj.overall_assessment ?? ""),
    };
  }

  it("extracts validated and missing deadlines", () => {
    const json = {
      validated_deadlines: [
        { original_frist: "Verjährung", original_datum: "02.08.2026", status: "gueltig" },
        { original_frist: "DSGVO", original_datum: "01.01.2027", status: "abgelaufen" },
      ],
      missing_deadlines: [{ frist: "Amtshaftung § 1 AHG", warnung: "Fehlt!" }],
      overall_assessment: "1 abgelaufen, 1 fehlt",
    };
    const result = extractDeadlineValidation(json);
    expect(result!.validated_deadlines.length).toBe(2);
    expect(result!.missing_deadlines.length).toBe(1);
    expect(result!.overall_assessment).toContain("abgelaufen");
  });

  it("returns null for invalid JSON", () => {
    const result = extractDeadlineValidation(null);
    expect(result).toBeNull();
  });
});
