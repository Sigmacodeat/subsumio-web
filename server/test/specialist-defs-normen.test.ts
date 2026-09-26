/**
 * Normen in den Fristen-/Kosten-Spezialisten müssen mit dem Fristenregister
 * der Web-Frist-Engine übereinstimmen und dürfen bekannte Falschnormen nicht
 * mehr enthalten.
 *
 * Quelle der AT-Normen: RIS (ris.bka.gv.at, Bundesrecht konsolidiert, Abruf
 * 26.09.2026), u. a.
 *   - § 464 Abs 1 ZPO   Berufungsfrist vier Wochen
 *   - § 505 Abs 2 ZPO   Revisionsfrist vier Wochen
 *   - § 230 Abs 1 ZPO   Klagebeantwortung vier Wochen
 *   - § 248 Abs 2 ZPO   Einspruch gegen Zahlungsbefehl vier Wochen
 *   - § 7 Abs 4 VwGVG   Bescheidbeschwerde vier Wochen
 *   - § 26 Abs 1 VwGG   Revisionsfrist sechs Wochen (Art 133 B-VG regelt
 *                       nur die Zuständigkeit des VwGH)
 *   - § 106 Abs 3 StPO  Einspruch wegen Rechtsverletzung sechs Wochen
 *   - §§ 284, 285, 466, 467 StPO  Anmeldung 3 Tage / Ausführung 4 Wochen
 *   - § 41 ZPO          Kostenersatz der unterliegenden Partei
 *   - § 105 Abs 4 ArbVG Kündigungsanfechtung (zwei Wochen)
 *   - § 67 Abs 2 ASGG   Klage gegen Bescheid des Versicherungsträgers
 *   - § 109 Abs 3 iVm § 97 Abs 1 Z 4 ArbVG  Sozialplan
 * DE-Normen: gesetze-im-internet.de (§ 517 ZPO, § 314/§ 341/§ 410 StPO,
 * § 70/§ 74 VwGO); CH: Art. 311 Abs. 1 ZPO (30 Tage).
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EMBEDDED_SPECIALISTS, resolveSpecialist } from "../src/core/minions/specialist-defs.ts";

const REPO_ROOT = join(import.meta.dir, "..", "..");

/** Reads `key` → `rechtsgrundlage` from a Fristen-Registry source file. */
function readRegistry(relPath: string): Map<string, string> {
  const src = readFileSync(join(REPO_ROOT, relPath), "utf8");
  const out = new Map<string, string>();
  const re = /key:\s*"([^"]+)"[\s\S]*?rechtsgrundlage:\s*"([^"]+)"/g;
  for (const m of src.matchAll(re)) out.set(m[1], m[2]);
  return out;
}

const AT_REGISTRY = readRegistry("src/lib/legal/frist-engine.ts");
const DE_REGISTRY = readRegistry("src/lib/legal/frist-engine-de.ts");

/** "§ 285 Abs 1 / § 467 Abs 1 StPO" → ["§ 285 Abs 1", "§ 467 Abs 1"] + "StPO". */
function normParts(norm: string): { paras: string[]; law: string } {
  const clean = norm.replace(/Abs\.\s*/g, "Abs ");
  const paras = [...clean.matchAll(/§\s*(\d+[a-z]?)(?:\s+Abs\s+(\d+))?/g)].map((m) =>
    m[2] ? `§ ${m[1]} Abs ${m[2]}` : `§ ${m[1]}`
  );
  const law = clean.trim().split(/\s+/).pop() ?? "";
  return { paras, law };
}

function prompt(name: string): string {
  const def = resolveSpecialist(name);
  if (!def) throw new Error(`specialist ${name} missing`);
  return def.systemPrompt.replace(/Abs\.\s*/g, "Abs ");
}

function expectNamesRegistryNorm(specialist: string, registry: Map<string, string>, key: string) {
  const norm = registry.get(key);
  expect(norm, `Registry-Eintrag ${key} fehlt`).toBeTruthy();
  const { paras, law } = normParts(norm!);
  const text = prompt(specialist);
  for (const p of paras) {
    // Die Norm muss mit dem richtigen Gesetz genannt sein (innerhalb derselben Zeile).
    const line = text.split("\n").find((l) => l.includes(p) && l.includes(law));
    expect(line, `${specialist}: ${p} ${law} (Register "${key}") fehlt`).toBeTruthy();
  }
}

describe("Fristen-Spezialisten ↔ Fristenregister (AT)", () => {
  const AT_KEYS_VALIDATOR = [
    "klagebeantwortung",
    "einspruch_zahlungsbefehl",
    "berufung",
    "revision",
    "rekurs",
    "einspruch_rechtsverletzung_stpo",
    "beschwerde_stpo",
    "berufungsanmeldung_stpo",
    "berufungsausfuehrung_stpo",
    "beschwerde_vwgvg",
    "revision_vwgh",
    "beschwerde_vfgh",
    "verjaehrung_kurz",
  ];
  for (const key of AT_KEYS_VALIDATOR) {
    it(`deadline-validator nennt ${key}`, () => {
      expectNamesRegistryNorm("deadline-validator", AT_REGISTRY, key);
    });
  }

  for (const key of ["berufung", "klagebeantwortung", "einspruch_zahlungsbefehl", "beschwerde_vwgvg", "revision_vwgh", "einspruch_rechtsverletzung_stpo"]) {
    it(`legal-deadline-extractor nennt ${key}`, () => {
      expectNamesRegistryNorm("legal-deadline-extractor", AT_REGISTRY, key);
    });
  }

  for (const key of ["berufung", "revision", "beschwerde_vwgvg", "revision_vwgh", "berufungsausfuehrung_stpo"]) {
    it(`appeal-risk-analyzer nennt ${key}`, () => {
      expectNamesRegistryNorm("appeal-risk-analyzer", AT_REGISTRY, key);
    });
  }

  for (const key of ["einspruch_zahlungsbefehl", "klagebeantwortung", "beschwerde_vwgvg", "revision_vwgh", "einspruch_rechtsverletzung_stpo"]) {
    it(`admissibility-checker nennt ${key}`, () => {
      expectNamesRegistryNorm("admissibility-checker", AT_REGISTRY, key);
    });
  }
});

describe("Fristen-Spezialisten ↔ Fristenregister (DE)", () => {
  for (const key of ["berufung_de", "berufung_stpo_de", "revision_stpo_de", "einspruch_strafbefehl_de", "widerspruch_vwvfg_de"]) {
    it(`deadline-validator nennt ${key}`, () => {
      expectNamesRegistryNorm("deadline-validator", DE_REGISTRY, key);
    });
  }
  it("legal-deadline-extractor nennt klage_vwgo_de", () => {
    expectNamesRegistryNorm("legal-deadline-extractor", DE_REGISTRY, "klage_vwgo_de");
  });
});

describe("keine bekannten Falschnormen in Spezialisten-Prompts", () => {
  // Jede Zeile: falsches Muster → was stattdessen gilt (siehe Kopfkommentar).
  const FORBIDDEN: Array<[RegExp, string]> = [
    [/§ 402 ZPO AT|AT § 402 ZPO/, "Berufungsfrist AT: § 464 Abs 1 ZPO"],
    [/§ 34 AVG/, "Bescheidbeschwerde AT: § 7 Abs 4 VwGVG"],
    [/Art 133 B-VG \(6 Wochen\)/, "Revisionsfrist AT: § 26 Abs 1 VwGG"],
    [/§ 394 ZPO/, "Kostenersatz AT: § 41 ZPO"],
    [/AHGB/, "AT-Anwaltstarif: RATG/AHK"],
    [/StBVV/, "CH-Anwaltstarif: kantonale Tarife (Art 96 ZPO)"],
    [/Art 314 OR/, "CH-Berufung: Art 311 Abs 1 ZPO"],
    [/§ 39 ArbVG/, "Kündigungsanfechtung AT: § 105 ArbVG"],
    [/§ 29 ArbVG/, "Sozialplan AT: § 109 Abs 3 iVm § 97 Abs 1 Z 4 ArbVG"],
    [/§ 51 ASGG/, "§ 51 ASGG ist eine Begriffsbestimmung, keine Frist"],
    [/§ 36a StPO/, "Beweisverbot AT: § 166 StPO"],
    [/GVgo/, "Geschäftsordnung: Geo."],
    [/§ 28 StPO/, "§ 28 StPO regelt die Zuständigkeitsübertragung"],
    [/§ 1287 ABGB/, "§ 1287 ABGB betrifft Versorgungsfonds, nicht Beweislast"],
    [/§ 229 ZPO/, "Widerklage AT: § 96 JN"],
    [/§ 234 ZPO/, "Beweissicherung AT: § 384 ZPO"],
    [/§ 27 JN/, "Anwaltspflicht AT: § 27 ZPO"],
    [/§ 519 ZPO/, "Berufungsfrist DE: § 517 ZPO"],
    [/Art 61 BV/, "Staatshaftung CH: Art 146 BV"],
    [/§ 66c AVG/, "existiert nicht"],
    [/§ 78c StPO/, "Verjährungsunterbrechung DE: § 78c StGB"],
  ];
  for (const def of EMBEDDED_SPECIALISTS) {
    it(`${def.name} enthält keine Falschnorm`, () => {
      for (const [re, hint] of FORBIDDEN) {
        expect(re.test(def.systemPrompt), `${def.name}: ${re} (${hint})`).toBe(false);
      }
    });
  }
});
