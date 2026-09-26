/**
 * The RIS OGD Judikatur applications this corpus mirrors, one entry per court.
 * Shared by fetch-all-at-judikatur.ts (full scan), ris-jud-index-crawl.ts
 * (document-exact index), fetch-jud-from-index.ts and corpus-pipeline.ts.
 * Pure data — importing it loads nothing else.
 *
 * `defaultFrom` is only where the legacy full scan starts; the index crawler
 * ignores it and walks back until RIS reports no older decisions.
 */

export interface CourtConfig {
  applikation: string;
  outDir: string;
  label: string;
  defaultFrom: number;
  knownTotal: number;
}

export const COURT_CONFIGS: Record<string, CourtConfig> = {
  ogh: {
    applikation: "Justiz",
    outDir: "at-judikatur",
    label: "OGH",
    defaultFrom: 2000,
    knownTotal: 58326,
  },
  vwgh: {
    applikation: "Vwgh",
    outDir: "at-judikatur-vwgh",
    label: "VwGH",
    defaultFrom: 1990,
    knownTotal: 248840,
  },
  vfgh: {
    applikation: "Vfgh",
    outDir: "at-judikatur-vfgh",
    label: "VfGH",
    defaultFrom: 1980,
    knownTotal: 17806,
  },
  bvwg: {
    applikation: "Bvwg",
    outDir: "at-judikatur-bvwg",
    label: "BVwG",
    defaultFrom: 2014,
    knownTotal: 287209,
  },
  lvwg: {
    applikation: "Lvwg",
    outDir: "at-judikatur-lvwg",
    label: "LVwG",
    defaultFrom: 2014,
    knownTotal: 76154,
  },
  asylgh: {
    applikation: "AsylGH",
    outDir: "at-judikatur-asylgh",
    label: "AsylGH",
    defaultFrom: 2008,
    knownTotal: 53113,
  },
  uvs: {
    applikation: "Uvs",
    outDir: "at-judikatur-uvs",
    label: "UVS",
    defaultFrom: 1991,
    knownTotal: 25939,
  },
  dsk: {
    applikation: "Dsk",
    outDir: "at-judikatur-dsk",
    label: "DSB",
    defaultFrom: 2010,
    knownTotal: 5000,
  },
  gbk: {
    applikation: "Gbk",
    outDir: "at-judikatur-gbk",
    label: "GBK",
    defaultFrom: 2004,
    knownTotal: 500,
  },
  pvak: {
    applikation: "Pvak",
    outDir: "at-judikatur-pvak",
    label: "PVAK",
    defaultFrom: 2002,
    knownTotal: 2000,
  },
  dok: {
    applikation: "Dok",
    outDir: "at-judikatur-dok",
    label: "DOK",
    defaultFrom: 2000,
    knownTotal: 3000,
  },
  ubas: {
    applikation: "Ubas",
    outDir: "at-judikatur-ubas",
    label: "UBAS",
    defaultFrom: 2000,
    knownTotal: 4052,
  },
  umse: {
    applikation: "Umse",
    outDir: "at-judikatur-umse",
    label: "UmSE",
    defaultFrom: 2001,
    knownTotal: 742,
  },
};
