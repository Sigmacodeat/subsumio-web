/**
 * One path convention for at-normen/: the daily delta writes a norm to the
 * file the full fetch created (and the citation check reads).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  bundesnormDirName,
  normFileKey,
  resolveBundesnormDir,
  resolveNormFileName,
} from "./ris-norm-paths";
import { docFilePath } from "./ris-delta-watcher";
import { planMerge, applyMerge } from "./merge-delta-gnr-dirs";
import type { DeltaApplikation, DeltaDocument } from "./ris-delta";

const BRKONS: DeltaApplikation = {
  applikation: "BrKons",
  endpoint: "Bundesrecht",
  corpusDir: "at-normen",
  label: "Bundesrecht",
  stateKey: "ris-delta-BrKons",
};

const abgbDoc: DeltaDocument = {
  id: "NOR40250001",
  applikation: "BrKons",
  changedAt: "2026-09-20",
  dokumentUrl: "https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR40250001/NOR40250001.html",
  xmlUrl: "https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR40250001/NOR40250001.xml",
  htmlUrl: null,
  pdfUrl: null,
  kurztitel: "Allgemeines bürgerliches Gesetzbuch",
  abkuerzung: "ABGB",
  gesetzesnummer: "10001622",
  geschaeftszahl: null,
  artikelParagraphAnlage: "§ 1295",
  changeType: "changed",
  inkrafttreten: "2026-10-01",
  ausserkrafttreten: null,
};

function norm(gnr: string, extra = ""): string {
  return `---\ngesetzesnummer: "${gnr}"\n${extra}---\n\n# Norm\n\nText.\n`;
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ris-norm-paths-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("full fetch and delta agree on the path", () => {
  it("an ABGB amendment lands in abgb/, exactly where the full fetch put the norm", () => {
    mkdirSync(join(root, "at-normen", "abgb"), { recursive: true });
    writeFileSync(join(root, "at-normen", "abgb", "p-1295.md"), norm("10001622"));

    const fullFetchPath = join(
      root,
      "at-normen",
      bundesnormDirName("ABGB", "10001622", false),
      `${normFileKey("p-1295", "NOR40250001", false)}.md`
    );
    expect(docFilePath(BRKONS, abgbDoc, root)).toBe(fullFetchPath);
    expect(docFilePath(BRKONS, abgbDoc, root)).toBe(join(root, "at-normen", "abgb", "p-1295.md"));
  });

  it("an abbreviation shared by another law gets the Gesetzesnummer suffix", () => {
    mkdirSync(join(root, "at-normen", "abgb"), { recursive: true });
    writeFileSync(join(root, "at-normen", "abgb", "p-1.md"), norm("99999999"));
    expect(resolveBundesnormDir(join(root, "at-normen"), "ABGB", "10001622")).toBe("abgb-10001622");
    expect(bundesnormDirName("ABGB", "10001622", true)).toBe("abgb-10001622");
  });

  it("an existing <abk>-<gnr> folder is used as is", () => {
    mkdirSync(join(root, "at-normen", "abgb-10001622"), { recursive: true });
    expect(docFilePath(BRKONS, abgbDoc, root)).toBe(
      join(root, "at-normen", "abgb-10001622", "p-1295.md")
    );
  });

  it("a law without abbreviation stays under gnr-<nr>/", () => {
    const doc = { ...abgbDoc, abkuerzung: null };
    expect(docFilePath(BRKONS, doc, root)).toBe(
      join(root, "at-normen", "gnr-10001622", "p-1295.md")
    );
  });

  it("a key the law keeps per NOR id is written with the NOR suffix", () => {
    const dir = join(root, "at-normen", "aktg");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "art-5-nor11111111.md"), norm("10002070"));
    expect(resolveNormFileName(dir, "art-5", "NOR22222222")).toBe("art-5-nor22222222.md");
    expect(resolveNormFileName(dir, "art-6", "NOR22222222")).toBe("art-6.md");
  });
});

describe("merge-delta-gnr-dirs", () => {
  function setup() {
    const n = join(root, "at-normen");
    mkdirSync(join(n, "abgb"), { recursive: true });
    mkdirSync(join(n, "gnr-10001622"), { recursive: true });
    mkdirSync(join(n, "gnr-20000001"), { recursive: true });
    writeFileSync(
      join(n, "abgb", "p-1295.md"),
      norm("10001622", 'retrieved_at: "2026-08-01"\n') + "ALT"
    );
    writeFileSync(
      join(n, "abgb", "p-1296.md"),
      norm("10001622", 'zuletzt_geaendert: "2026-09-25"\n') + "AKTUELL"
    );
    const delta = (d: string) =>
      norm("10001622", `abbreviation: "ABGB"\nnor_id: "NOR1"\nzuletzt_geaendert: "${d}"\n`);
    writeFileSync(join(n, "gnr-10001622", "p-1295.md"), delta("2026-09-20") + "NEU");
    writeFileSync(join(n, "gnr-10001622", "p-1296.md"), delta("2026-09-01"));
    writeFileSync(join(n, "gnr-10001622", "p-1297.md"), delta("2026-09-20"));
    // A law without abbreviation: its gnr folder is correct and stays.
    writeFileSync(join(n, "gnr-20000001", "p-1.md"), norm("20000001"));
  }

  it("dry run plans move/replace/drop and changes nothing", () => {
    setup();
    const plan = planMerge(root);
    const byFile = Object.fromEntries(plan.map((a) => [a.from, a.kind]));
    expect(byFile).toEqual({
      "at-normen/gnr-10001622/p-1295.md": "replace",
      "at-normen/gnr-10001622/p-1296.md": "drop",
      "at-normen/gnr-10001622/p-1297.md": "move",
    });
    expect(existsSync(join(root, "at-normen", "gnr-10001622", "p-1295.md"))).toBe(true);
  });

  it("apply leaves one file per norm, in the abbreviation folder, and queues the page changes", () => {
    setup();
    applyMerge(root, planMerge(root));
    const n = join(root, "at-normen");
    expect(readFileSync(join(n, "abgb", "p-1295.md"), "utf8")).toContain("NEU");
    expect(readFileSync(join(n, "abgb", "p-1296.md"), "utf8")).toContain("AKTUELL");
    expect(existsSync(join(n, "abgb", "p-1297.md"))).toBe(true);
    expect(existsSync(join(n, "gnr-10001622"))).toBe(false);
    expect(existsSync(join(n, "gnr-20000001", "p-1.md"))).toBe(true);

    const queue = JSON.parse(
      readFileSync(join(root, "_normalized", "_import-warteschlange.json"), "utf8")
    ) as Array<{ pfad: string; art: string }>;
    const q = Object.fromEntries(queue.map((e) => [e.pfad, e.art]));
    expect(q["at-normen/abgb/p-1295.md"]).toBe("edit");
    expect(q["at-normen/abgb/p-1297.md"]).toBe("edit");
    expect(q["at-normen/gnr-10001622/p-1295.md"]).toBe("delete");
    expect(q["at-normen/gnr-10001622/p-1296.md"]).toBe("delete");
    expect(q["at-normen/abgb/p-1296.md"]).toBeUndefined();
  });
});
