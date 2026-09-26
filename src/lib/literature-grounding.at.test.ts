// @vitest-environment node
// Austrian literature, Gesetzesmaterialien and ECLI citations are counted —
// flagged as "check it" — instead of silently falling out of the check.
import { describe, test, expect } from "vitest";
import { extractLiteratureCitations } from "@/lib/citation-gate-client";
import { groundLiteratureCitations } from "@/lib/legal-grounding";
import { extractCaseCitations } from "@/lib/case-citations";

describe("Austrian literature and Materialien", () => {
  test("commentary with Rz: Reischauer in Rummel, ABGB³ § 1295 Rz 1", async () => {
    const refs = extractLiteratureCitations("*Reischauer* in *Rummel*, ABGB³ § 1295 Rz 1.");
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      kind: "licensed_work",
      work: "Rummel",
      ref: "ABGB § 1295",
      pinpoint: "Rz 1",
      jurisdiction: "at",
    });
    const [g] = await groundLiteratureCitations(refs);
    expect(g.verified).toBe(false);
    expect(g.category).toBe("verlags_literatur");
    expect(g.unverifiable_reason).toMatch(/nicht im freien Korpus/);
  });

  test("online commentary: Kodek in Kletečka/Schauer, ABGB-ON1.05 § 879 Rz 3", () => {
    const refs = extractLiteratureCitations("Kodek in Kletečka/Schauer, ABGB-ON1.05 § 879 Rz 3");
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ work: "Kletečka/Schauer", ref: "ABGB-ON § 879" });
  });

  test("an unknown name before 'Rz' is not taken for a commentary", () => {
    expect(extractLiteratureCitations("Beispiel, ABGB § 1 Rz 2")).toHaveLength(0);
  });

  test("ErläutRV 1234 BlgNR 24. GP: one unverified entry with a Parliament link", async () => {
    const refs = extractLiteratureCitations("vgl ErläutRV 1234 BlgNR 24. GP 5.");
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      kind: "materialien",
      work: "ErläutRV",
      ref: "1234 BlgNR XXIV. GP",
      jurisdiction: "at",
    });
    const [g] = await groundLiteratureCitations(refs);
    expect(g.verified).toBe(false);
    expect(g.category).toBe("materialien");
    expect(g.search_url).toBe("https://www.parlament.gv.at/gegenstand/XXIV/I/1234");
    expect(g.unverifiable_reason).toMatch(/Parlament/);
  });

  test("AB with a Roman GP", () => {
    const refs = extractLiteratureCitations("AB 567 BlgNR XXVII. GP");
    expect(refs[0]?.ref).toBe("567 BlgNR XXVII. GP");
  });

  test("an ECLI yields exactly one case-law entry", () => {
    const cases = extractCaseCitations("ECLI:AT:OGH0002:2024:0010OB00023.24X.0101.000");
    expect(cases).toHaveLength(1);
    expect(cases[0]!.court).toBe("OGH");
  });
});
