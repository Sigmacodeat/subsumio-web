import { describe, expect, it } from "vitest";
import {
  buildCaseFieldSuggestions,
  normalizeAnalysisParties,
  resolvePartySides,
} from "./case-suggestions";

describe("normalizeAnalysisParties", () => {
  it("accepts strings and objects; empty names are dropped", () => {
    expect(
      normalizeAnalysisParties({
        parties: ["Anna Beispiel", { name: "Widget-Co GmbH", role: "Gegner" }, { name: "" }, ""],
      })
    ).toEqual([
      { name: "Anna Beispiel", role: "sonstige" },
      { name: "Widget-Co GmbH", role: "gegner" },
    ]);
  });

  it("prefers the engine's party_roles over plain names", () => {
    expect(
      normalizeAnalysisParties({
        parties: ["Anna Beispiel"],
        party_roles: [{ name: "Anna Beispiel", role: "klagende_partei", vertreter: "Dr. X" }],
      })
    ).toEqual([{ name: "Anna Beispiel", role: "klagende_partei", vertreter: "Dr. X" }]);
  });
});

describe("resolvePartySides", () => {
  it("a known opponent on the Kläger side makes the Beklagte our side", () => {
    const out = resolvePartySides(
      [
        { name: "Widget-Co GmbH", role: "klagende_partei", vertreter: "Mag. Kollegin" },
        { name: "Zweiter Beklagter", role: "beklagte_partei" },
      ],
      { opponent_name: "Widget-Co GmbH" }
    );
    // Opponent itself is not suggested again; its lawyer is Gegnervertreter;
    // a co-defendant on our side keeps its procedural role.
    expect(out).toEqual([
      { name: "Mag. Kollegin", role: "gegnervertreter" },
      { name: "Zweiter Beklagter", role: "beklagte_partei" },
    ]);
  });
});

describe("buildCaseFieldSuggestions", () => {
  it("a rejected suggestion does not come back with the next document", () => {
    const out = buildCaseFieldSuggestions(
      { streitwert: { value: 8450, quote: "EUR 8.450", method: "regex" } },
      {
        suggested_case_fields: [{ field: "dispute_value", value: 8450, review_status: "rejected" }],
      },
      "KI-Analyse: doc"
    );
    expect(out).toEqual([]);
  });
});
