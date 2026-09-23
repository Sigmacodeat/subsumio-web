/**
 * Integritäts-Test für die Corpus-Pipeline-Registry.
 *
 * Hätte den Bug gefangen, dass 74.882 de- und 4.338 ch-Entscheide auf
 * Disk lagen, aber kein Pipeline-Step existierte — sie wären nie in
 * die DB gekommen. Prüft:
 *  - jede importCmd-Script-Datei existiert wirklich
 *  - sourceIds sind eindeutig und jurisdiction-konform (law-{at,de,ch,eu}-*)
 *  - keine doppelten keys
 *  - bekannte Corpora (de/ch-Judikatur) haben einen Step
 */

import { describe, test, expect } from "vitest";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SIMPLE, JUDIKATUR } from "../scripts/corpus-pipeline";
import {
  AT_LAW_SOURCES_ALL,
  DE_LAW_SOURCES_ALL,
  CH_LAW_SOURCES_ALL,
  EU_LAW_SOURCES_ALL,
} from "../src/core/legal/jurisdiction";

const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const ALL_SOURCES = [
  ...SIMPLE.map((s) => ({ key: s.key, sourceId: s.sourceId, importCmd: s.importCmd })),
  ...JUDIKATUR.map((s) => ({
    key: s.key,
    sourceId: s.sourceId,
    importCmd: null as string[] | null,
  })),
];

describe("corpus-pipeline registry integrity", () => {
  test("keine doppelten keys oder sourceIds", () => {
    const keys = ALL_SOURCES.map((s) => s.key);
    const sourceIds = ALL_SOURCES.map((s) => s.sourceId);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(sourceIds).size).toBe(sourceIds.length);
  });

  test("jede sourceId folgt law-{jurisdiction}-*", () => {
    for (const s of ALL_SOURCES) {
      expect(s.sourceId).toMatch(/^law-(at|de|ch|eu)(-.+)?$/);
    }
  });

  test("jede importCmd-Script-Datei existiert auf Disk", () => {
    for (const s of ALL_SOURCES) {
      if (!s.importCmd) continue;
      const scriptPath = s.importCmd[0];
      // argv wie "scripts/import-judikatur.ts" — relativ zu server/
      expect(
        existsSync(join(SERVER_DIR, scriptPath)),
        `${s.key}: ${scriptPath} nicht gefunden`
      ).toBe(true);
    }
  });

  test("de-, ch- und eu-Judikatur haben Pipeline-Steps (Regression: lagen auf Disk ohne Step)", () => {
    const deJudikatur = SIMPLE.find((s) => s.key === "judikatur-de");
    const chJudikatur = SIMPLE.find((s) => s.key === "judikatur-ch");
    const euJudikatur = SIMPLE.find((s) => s.key === "judikatur-eu");
    expect(deJudikatur?.sourceId).toBe("law-de-judikatur");
    expect(chJudikatur?.sourceId).toBe("law-ch-judikatur");
    expect(euJudikatur?.sourceId).toBe("law-eu-judikatur");
    expect(deJudikatur?.importCmd?.[0]).toBe("scripts/import-judikatur.ts");
    expect(chJudikatur?.importCmd).toContain("ch");
    expect(euJudikatur?.importCmd).toContain("eu");
  });

  test("jede Registry-sourceId ist im Source-Routing erreichbar", () => {
    // Gegenrichtung zum Judikatur-Bug: eine importierte Source, die in
    // keiner Jurisdictions-Liste steht, ist tote Daten — importiert,
    // aber für Queries unsichtbar (war bei law-eu-directives und
    // law-ch-literatur der Fall).
    const routed: Record<string, string[]> = {
      at: AT_LAW_SOURCES_ALL,
      de: DE_LAW_SOURCES_ALL,
      ch: CH_LAW_SOURCES_ALL,
      eu: EU_LAW_SOURCES_ALL,
    };
    for (const s of ALL_SOURCES) {
      const jur = s.sourceId.match(/^law-([a-z]{2})/)?.[1];
      expect(jur, `${s.sourceId}: kein law-{jur}-Prefix`).toBeTruthy();
      expect(
        routed[jur!],
        `${s.sourceId} (${s.key}) ist importiert, aber in keiner Routing-Liste — Queries erreichen es nie`
      ).toContain(s.sourceId);
    }
  });

  test("dirimport-Steps mit Corpus auf Disk haben ein importCmd", () => {
    // Kernaussage des Bugs: Step ohne importCmd wird nie importiert.
    // Steps mit importCmd:null sind bewusst manuell (Dokumentation im
    // Feld-Kommentar); hier pinnen wir nur, dass judikatur-* nie null ist.
    for (const s of SIMPLE.filter((x) => x.key.startsWith("judikatur-"))) {
      expect(s.importCmd, `${s.key} hat kein importCmd`).not.toBeNull();
    }
  });
});
