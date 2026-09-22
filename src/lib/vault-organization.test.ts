import { describe, expect, it } from "vitest";
import { planVaultOrganization, suggestFolder, VAULT_FOLDER_ORDER } from "./vault-organization";

describe("suggestFolder", () => {
  it("ordnet nach doc_type ein", () => {
    expect(suggestFolder({ name: "x.pdf", doc_type: "vertrag" })?.folder).toBe("Verträge");
    expect(suggestFolder({ name: "x.pdf", doc_type: "urteil" })?.folder).toBe(
      "Gerichtliche Entscheidungen"
    );
    expect(suggestFolder({ name: "x.pdf", doc_type: "rechnung" })?.folder).toBe("Finanzen");
  });

  it("nutzt kind als zweites Signal", () => {
    expect(suggestFolder({ name: "x.pdf", kind: "email" })?.folder).toBe("Korrespondenz");
    expect(suggestFolder({ name: "x.pdf", kind: "evidence" })?.folder).toBe("Beweise & Gutachten");
  });

  it("erkennt DocType aus dem Dateinamen", () => {
    expect(suggestFolder({ name: "Mietvertrag_Mueller.pdf" })?.folder).toBe("Verträge");
    expect(suggestFolder({ name: "Klage_2026-01.pdf" })?.folder).toBe("Schriftsätze");
  });

  it("nutzt Quellen-Signale", () => {
    expect(suggestFolder({ name: "x.pdf", source: "portal_upload" })?.folder).toBe("Korrespondenz");
  });

  it("gibt null bei fehlendem Signal", () => {
    expect(suggestFolder({ name: "scan0042.pdf" })).toBeNull();
  });
});

describe("planVaultOrganization", () => {
  const docs = [
    { key: "d/1", name: "Klage.pdf", doc_type: "klage" },
    { key: "d/2", name: "scan.pdf", folder: "Verträge" },
    { key: "d/3", name: "Rechnung.pdf", doc_type: "rechnung" },
    { key: "d/4", name: "zettel.pdf" },
  ];

  it("ordnet nur ungeordnete Dokumente ein (default)", () => {
    const plan = planVaultOrganization(docs);
    const keys = plan.map((a) => a.key);
    expect(keys).toContain("d/1");
    expect(keys).toContain("d/3");
    expect(keys).not.toContain("d/2"); // hat schon Ordner
    expect(keys).not.toContain("d/4"); // kein Signal
  });

  it("überschreibt bestehende Ordner nur bei overwrite", () => {
    const plan = planVaultOrganization(docs, { onlyUnsorted: false, overwrite: true });
    // d/2 hat "Verträge", kein doc_type/Name-Signal → kein Vorschlag, bleibt
    expect(plan.map((a) => a.key)).not.toContain("d/2");
  });

  it("überspringt identische Vorschläge", () => {
    const same = [{ key: "d/9", name: "Vertrag.pdf", doc_type: "vertrag", folder: "Verträge" }];
    expect(planVaultOrganization(same, { onlyUnsorted: false, overwrite: true })).toHaveLength(0);
  });

  it("alle Ordner kommen aus der kanonischen Taxonomie", () => {
    for (const a of planVaultOrganization(docs, { onlyUnsorted: false, overwrite: true })) {
      expect(VAULT_FOLDER_ORDER).toContain(a.folder);
    }
  });
});
