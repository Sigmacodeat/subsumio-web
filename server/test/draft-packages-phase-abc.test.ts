import { describe, it, expect } from "bun:test";
import {
  resolveDraftPackages,
  NEBENVERFAHREN_PACKAGES,
  type AdditionalOpponentLike,
  type Nebenverfahren,
} from "../src/core/legal/draft-packages.ts";

// ── Phase A: Multi-Opponent Expansion ──────────────────────────

describe("Phase A: additionalOpponents expansion", () => {
  const datenverantwortlicher1: AdditionalOpponentLike = {
    name: "Datenverarbeiter GmbH",
    rolle: "datenverantwortlicher",
    haftungsgrund: "Art 82 DSGVO",
  };
  const datenverantwortlicher2: AdditionalOpponentLike = {
    name: "Cloud Provider AG",
    rolle: "datenverantwortlicher",
    haftungsgrund: "Art 82 DSGVO",
  };
  const beamter: AdditionalOpponentLike = {
    name: "Beamter Müller",
    rolle: "beamter",
  };

  it("expands dsgvo_beschwerde per datenverantwortlicher opponent", () => {
    const pkgs = resolveDraftPackages({
      jurisdiction: "at",
      verfahrenstyp: "straf",
      additionalOpponents: [datenverantwortlicher1, datenverantwortlicher2],
    });
    const dsgvoPkgs = pkgs.filter((p) => p.type.startsWith("dsgvo_beschwerde__"));
    expect(dsgvoPkgs.length).toBe(2);
    expect(dsgvoPkgs[0]!.title).toContain("Datenverarbeiter GmbH");
    expect(dsgvoPkgs[1]!.title).toContain("Cloud Provider AG");
  });

  it("hinweis includes opponent name and haftungsgrund", () => {
    const pkgs = resolveDraftPackages({
      jurisdiction: "at",
      verfahrenstyp: "straf",
      additionalOpponents: [datenverantwortlicher1],
    });
    const dsgvo = pkgs.find((p) => p.type.startsWith("dsgvo_beschwerde__"));
    expect(dsgvo?.hinweis).toContain("Datenverarbeiter GmbH");
    expect(dsgvo?.hinweis).toContain("Art 82 DSGVO");
  });

  it("keeps package once when no matching opponent (backward compat)", () => {
    const pkgs = resolveDraftPackages({
      jurisdiction: "at",
      verfahrenstyp: "straf",
      additionalOpponents: [beamter],
    });
    const dsgvoPkgs = pkgs.filter((p) => p.type === "dsgvo_beschwerde");
    expect(dsgvoPkgs.length).toBe(1);
  });

  it("non-perOpponent packages are not duplicated", () => {
    const pkgs = resolveDraftPackages({
      jurisdiction: "at",
      verfahrenstyp: "straf",
      additionalOpponents: [datenverantwortlicher1, datenverantwortlicher2, beamter],
    });
    const types = pkgs.map((p) => p.type);
    const ahgCount = types.filter((t) => t === "ahg_antrag").length;
    const strafantragCount = types.filter((t) => t === "strafantrag").length;
    expect(ahgCount).toBe(1);
    expect(strafantragCount).toBe(1);
  });

  it("slug in opponent name is sanitized", () => {
    const pkgs = resolveDraftPackages({
      jurisdiction: "at",
      verfahrenstyp: "straf",
      additionalOpponents: [{ name: "Evil Corp. LLC!", rolle: "datenverantwortlicher" }],
    });
    const dsgvo = pkgs.find((p) => p.type.startsWith("dsgvo_beschwerde__"));
    expect(dsgvo?.type).toBe("dsgvo_beschwerde__evil-corp-llc-");
  });
});

// ── Phase C: Nebenverfahren Packages ───────────────────────────

describe("Phase C: nebenverfahren packages", () => {
  it("appends disziplinar package when nebenverfahren includes disziplinar", () => {
    const pkgs = resolveDraftPackages({
      jurisdiction: "at",
      verfahrenstyp: "straf",
      nebenverfahren: ["disziplinar"],
    });
    const types = pkgs.map((p) => p.type);
    expect(types).toContain("disziplinarantrag");
  });

  it("appends multiple nebenverfahren packages", () => {
    const pkgs = resolveDraftPackages({
      jurisdiction: "at",
      verfahrenstyp: "straf",
      nebenverfahren: ["disziplinar", "befangenheit", "haftantrag"],
    });
    const types = pkgs.map((p) => p.type);
    expect(types).toContain("disziplinarantrag");
    expect(types).toContain("befangenheitsantrag");
    expect(types).toContain("haftantrag");
  });

  it("does not duplicate nebenverfahren packages already in base set", () => {
    const pkgs = resolveDraftPackages({
      jurisdiction: "at",
      verfahrenstyp: "straf",
      nebenverfahren: ["dsb_beschwerde"],
    });
    const dsbCount = pkgs.filter((p) => p.type === "dsb_beschwerde").length;
    // Legacy AT package already has dsgvo_beschwerde (not dsb_beschwerde),
    // so dsb_beschwerde should be appended once
    expect(dsbCount).toBe(1);
  });

  it("all 7 nebenverfahren types have valid packages", () => {
    const nvs: Nebenverfahren[] = [
      "disziplinar",
      "dienstaufsicht",
      "befangenheit",
      "verfahrenshilfe",
      "haftantrag",
      "dsb_beschwerde",
      "finanzstrafanzeige",
    ];
    for (const nv of nvs) {
      const pkg = NEBENVERFAHREN_PACKAGES[nv];
      expect(pkg).toBeDefined();
      expect(pkg.type).toBeTruthy();
      expect(pkg.title).toBeTruthy();
    }
  });

  it("combined: additionalOpponents + nebenverfahren", () => {
    const pkgs = resolveDraftPackages({
      jurisdiction: "at",
      verfahrenstyp: "straf",
      additionalOpponents: [{ name: "DV GmbH", rolle: "datenverantwortlicher" }],
      nebenverfahren: ["disziplinar", "befangenheit"],
    });
    const types = pkgs.map((p) => p.type);
    expect(types).toContain("dsgvo_beschwerde__dv-gmbh");
    expect(types).toContain("disziplinarantrag");
    expect(types).toContain("befangenheitsantrag");
    expect(types).toContain("versand_checkliste");
  });

  it("empty nebenverfahren array = no extra packages", () => {
    const base = resolveDraftPackages({ jurisdiction: "at", verfahrenstyp: "straf" });
    const withEmpty = resolveDraftPackages({
      jurisdiction: "at",
      verfahrenstyp: "straf",
      nebenverfahren: [],
    });
    expect(withEmpty.length).toBe(base.length);
  });
});

// ── Phase B: Pipeline Data Fields (smoke test) ─────────────────

describe("Phase B: related_case_slugs & mandate_id concept", () => {
  it("resolveDraftPackages is unaffected by related_case_slugs (pipeline concern)", () => {
    const pkgs = resolveDraftPackages({ jurisdiction: "at", verfahrenstyp: "zivil" });
    expect(pkgs.length).toBeGreaterThan(0);
    expect(pkgs.some((p) => p.type === "versand_checkliste")).toBe(true);
  });
});
