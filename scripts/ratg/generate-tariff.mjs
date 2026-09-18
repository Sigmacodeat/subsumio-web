// Generates src/lib/legal/ratg-tariff-data.ts from the RIS text of Anl. 1 RATG.
//
//   node scripts/ratg/generate-tariff.mjs [path/to/at-normen/ratg/anl-1.md]
//
// The tariff is not typed by hand: every amount comes from the official text,
// and each band is replaced by the most recent valorised value from its
// "(Anm. n)" footnote. A consistency check refuses to write the file when any
// valorised amount does not relate to its predecessor by the same factor as
// the rest of its block — the symptom of a footnote mapped to the wrong band.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SRC =
  process.argv[2] ??
  path.join(
    process.env.LAW_CORPUS_ROOT ?? "/Users/msc/subsumio-data/law-corpus",
    "at-normen/ratg/anl-1.md"
  );
const OUT = path.join(process.cwd(), "src/lib/legal/ratg-tariff-data.ts");

const raw = readFileSync(SRC, "utf8");
const fm = Object.fromEntries(
  [...raw.split("---")[1].matchAll(/^(\w+):\s*"?(.*?)"?$/gm)].map((m) => [m[1], m[2]])
);
const lines = raw
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);
const euro = (s) => Number(s.replace(/\s/g, "").replace(/\./g, "").replace(",", "."));

const blocks = [];
let tp = null;
let letter = "";
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  const tpm = l.match(/^Tarifpost (\d+)$/);
  if (tpm) {
    tp = tpm[1];
    letter = "";
    continue;
  }
  if (/^[A-C]$/.test(l) && tp === "3") {
    letter = l;
    continue;
  }
  if (l !== "bei einer Bemessungsgrundlage" || !["1", "2", "3"].includes(tp)) continue;
  const key = `TP${tp}${letter}`;
  if (blocks.some((b) => b.key === key)) continue;

  const bands = [];
  let j = i + 1;
  for (; j < lines.length; j++) {
    const m = lines[j].match(
      /^(?:über [\d\s]+ Euro )?bis einschließlich ([\d\s]+) Euro ([\d\s.,]+) Euro, \(Anm\. (\d+)\)$/
    );
    if (!m) break;
    bands.push({ upTo: euro(m[1]), base: euro(m[2]), anm: Number(m[3]) });
  }
  const tail = lines.slice(j, j + 12).join(" ");
  const step = tail.match(
    /für je angefangene weitere ([\d\s]+) Euro um ([\d\s,]+) Euro \(Anm\. (\d+)\) mehr/
  );
  const pm = [...tail.matchAll(/überdies vom Mehrbetrag über ([\d\s]+) Euro ([\d,]+) vT/g)];
  const cap = tail.match(/jedoch nie mehr als ([\d\s.,]+) Euro[^(]*\(Anm\. (\d+)\)/);
  if (bands.length !== 12 || !step || pm.length !== 2 || !cap) {
    throw new Error(`${key}: unexpected structure (bands=${bands.length})`);
  }
  // Footnote list: the next "(___________" after the block.
  let k = j;
  while (k < lines.length && !lines[k].startsWith("(____")) k++;
  const anm = {};
  let current = null;
  for (k = k + 1; k < lines.length; k++) {
    const head = lines[k].match(/^Anm\. (\d+):/);
    if (head) current = Number(head[1]);
    const val = lines[k].match(/ab 1\.5\.2023: ([\d\s.,]+) Euro\)?$/);
    if (val && current !== null) anm[current] = euro(val[1]);
    if (lines[k].endsWith(")")) break;
  }
  // Hourly cap for hearings, where the block has one.
  let hourCap = null;
  for (let h = j; h < Math.min(k, lines.length); h++) {
    if (
      /weitere, wenn auch nur begonnene Stunde/.test(lines[h]) &&
      /\(Anm\. 14\)/.test(lines[h] + " " + (lines[h + 1] ?? ""))
    ) {
      hourCap = anm[14] ?? null;
      break;
    }
  }
  const valorised = bands.map((b) => ({ upTo: b.upTo, amount: anm[b.anm], original: b.base }));
  if (valorised.some((b) => !b.amount)) throw new Error(`${key}: missing valorised footnote`);

  // Consistency: the block's factor comes from its largest amount (the cap),
  // where rounding to 10 cents is negligible. Every other amount must match
  // original × factor within rounding (0.20 €) plus 1 %. A footnote attached
  // to the wrong band differs by far more, since neighbouring bands differ
  // by at least 8 %.
  const factor = anm[Number(cap[2])] / euro(cap[1]);
  const checks = [
    ...valorised.map((b) => [b.original, b.amount, `band ≤ ${b.upTo}`]),
    [euro(step[2]), anm[Number(step[3])], "step"],
  ];
  for (const [orig, val, label] of checks) {
    const expected = orig * factor;
    if (Math.abs(val - expected) > 0.2 + expected * 0.01) {
      throw new Error(`${key} ${label}: ${val} does not match ${orig} × ${factor.toFixed(4)}`);
    }
  }
  const ratios = [factor];
  const lo = factor,
    hi = factor;

  blocks.push({
    key,
    bands: valorised.map(({ upTo, amount }) => ({ upTo, amount })),
    stepEvery: euro(step[1]),
    stepAmount: anm[Number(step[3])],
    stepFrom: 10170,
    stepTo: 34820,
    extraStepTo: 36340,
    permille: [
      { over: euro(pm[0][1]), rate: Number(pm[0][2].replace(",", ".")) / 1000 },
      { over: euro(pm[1][1]), rate: Number(pm[1][2].replace(",", ".")) / 1000 },
    ],
    cap: anm[Number(cap[2])],
    hourCap,
    ratio: Number(((lo + hi) / 2).toFixed(4)),
  });
  i = k;
}

// ── TP 4 to TP 9 ─────────────────────────────────────────────────────────
// Each Tarifpost is a paragraph of text followed by its "(___________" footnote
// list. amountsOf() returns the valorised value (ab 1.5.2023) for every
// "(Anm. n)" in that list; valorised() maps an original amount in the text to
// it and checks the ratio against the rest of the post.
function postRange(n) {
  const start = lines.findIndex((l) => l === `Tarifpost ${n}`);
  if (start < 0) throw new Error(`Tarifpost ${n} not found`);
  let end = lines.findIndex((l, idx) => idx > start && /^Tarifpost \d+$/.test(l));
  if (end < 0) end = lines.findIndex((l, idx) => idx > start && l.startsWith("## "));
  return lines.slice(start, end);
}
function footnotes(post) {
  const anm = {};
  const previous = {};
  let current = null;
  let inList = false;
  for (const l of post) {
    if (l.startsWith("(____")) inList = true;
    if (!inList) continue;
    const head = l.match(/^Anm\. (\d+):/);
    if (head) current = Number(head[1]);
    const v2016 = l.match(/ab 1\.1\.2016: ([\d\s.,]+) Euro/);
    if (v2016 && current !== null) previous[current] = euro(v2016[1]);
    const val = l.match(/ab 1\.5\.2023: ([\d\s.,]+) Euro\)?$/);
    if (val && current !== null) anm[current] = euro(val[1]);
  }
  // BGBl. II Nr. 131/2023 raised every amount by the same index (~20 %) over
  // BGBl. II Nr. 393/2015. A value read into the wrong footnote breaks that.
  // Amounts are rounded to 10 cents, so allow that plus 1 %.
  for (const n of Object.keys(anm)) {
    const expected = previous[n] * 1.2;
    if (!(Math.abs(anm[n] - expected) <= 0.1 + expected * 0.01)) {
      throw new Error(`Anm. ${n}: ${previous[n]} → ${anm[n]} is not the 2023 valorisation`);
    }
  }
  return anm;
}
function textOf(post) {
  const cut = post.findIndex((l) => l.startsWith("(____"));
  return post.slice(0, cut < 0 ? undefined : cut).join(" ");
}
/** All "<amount> Euro ... (Anm. n)" pairs in the text, in order. */
function pairs(text) {
  // The amount stands right before its footnote: "2,70 Euro, (Anm. 1)",
  // "462,30Euro (Anm. 8)". Thresholds ("bis einschließlich 70 Euro") never do.
  return [...text.matchAll(/(\d[\d ]*(?:,\d+)?) ?Euro[,.;]? ?\(Anm\. (\d+)\)/g)].map((m) => ({
    original: euro(m[1]),
    anm: Number(m[2]),
  }));
}
function checkFactor(key, list, anm) {
  const ratios = list.map((p) => anm[p.anm] / p.original);
  if (ratios.some((r) => !Number.isFinite(r))) throw new Error(`${key}: missing footnote`);
  const largest = Math.max(...list.map((p) => p.original));
  const ref = list.find((p) => p.original === largest);
  const f = anm[ref.anm] / ref.original;
  for (const p of list) {
    const expected = p.original * f;
    if (Math.abs(anm[p.anm] - expected) > 0.2 + expected * 0.01) {
      throw new Error(
        `${key}: Anm. ${p.anm} = ${anm[p.anm]} does not match ${p.original} × ${f.toFixed(4)}`
      );
    }
  }
}

function bandPost(n) {
  const post = postRange(n);
  const anm = footnotes(post);
  const text = textOf(post);
  const list = pairs(text);
  checkFactor(`TP${n}`, list, anm);
  const bands = [
    ...text.matchAll(/bis einschließlich ([\d\s]+) Euro ([\d\s,]+) Euro, \(Anm\. (\d+)\)/g),
  ].map((m) => ({ upTo: euro(m[1]), amount: anm[Number(m[3])] }));
  return { post, anm, text, bands };
}

// TP 5: einfache Schreiben.
const tp5 = (() => {
  const { anm, text, bands } = bandPost(5);
  const step = text.match(
    /über ([\d\s]+) Euro für je angefangene weitere ([\d\s]+) Euro um [\d,]+ Euro \(Anm\. (\d+)\) mehr/
  );
  const cap = text.match(/jedoch nie mehr als [\d\s,]+ Euro\. \(Anm\. (\d+)\)/);
  if (bands.length !== 6 || !step || !cap) throw new Error("TP5: unexpected structure");
  return {
    bands,
    stepFrom: euro(step[1]),
    stepEvery: euro(step[2]),
    stepAmount: anm[Number(step[3])],
    cap: anm[Number(cap[1])],
  };
})();

// TP 6: das Doppelte von TP 5, gedeckelt.
const tp6Cap = (() => {
  const post = postRange(6);
  const anm = footnotes(post);
  return anm[1];
})();

// TP 7: Geschäfte außerhalb der Kanzlei, je begonnene halbe Stunde.
const tp7 = (() => {
  const post = postRange(7);
  const anm = footnotes(post);
  return { capGehilfe: anm[1], capAnwalt: anm[2] };
})();

// TP 8: Besprechungen, je begonnene halbe Stunde.
const tp8 = (() => {
  const { anm, text, bands } = bandPost(8);
  const step1 = text.match(
    /über ([\d\s]+) Euro bis einschließlich ([\d\s]+) Euro für je angefangene weitere ([\d\s]+) Euro um [\d,]+ Euro \(Anm\. (\d+)\) mehr/
  );
  const extra = text.match(
    /über ([\d\s]+) Euro bis einschließlich ([\d\s]+) Euro um [\d,]+ Euro \(Anm\. (\d+)\) mehr/
  );
  const step2 = text.match(
    /über ([\d\s]+) Euro für je angefangene weitere ([\d\s]+) Euro um [\d,]+ Euro \(Anm\. (\d+)\) mehr, jedoch nie mehr als [\d\s,]+ ?Euro \(Anm\. (\d+)\)/
  );
  const short = text.match(
    /weniger als zehn Minuten beträgt die Entlohnung vier Zehntel .*? nie mehr als [\d\s,]+ Euro\. \(Anm\. (\d+)\)/
  );
  if (bands.length !== 5 || !step1 || !extra || !step2 || !short)
    throw new Error("TP8: unexpected structure");
  return {
    bands,
    stepFrom: euro(step1[1]),
    stepTo: euro(step1[2]),
    stepEvery: euro(step1[3]),
    stepAmount: anm[Number(step1[4])],
    extraStepTo: euro(extra[2]),
    step2Every: euro(step2[2]),
    step2Amount: anm[Number(step2[3])],
    cap: anm[Number(step2[4])],
    shortFactor: 0.4,
    shortCap: anm[Number(short[1])],
  };
})();

// TP 9: Wegentschädigung (Z 1 lit c) und Zeitversäumnis (Z 4), je begonnene Stunde.
const tp9 = (() => {
  const post = postRange(9);
  const anm = footnotes(post);
  const text = textOf(post);
  const weg = text.match(
    /Wegentschädigung für jede, wenn auch nur begonnene Stunde von [\d,]+ Euro; \(Anm\. (\d+)\)/
  );
  const zeit = text.match(
    /Entschädigung für Zeitversäumnis .*? ein Betrag von [\d,]+ Euro\. \(Anm\. (\d+)\)/
  );
  if (!weg || !zeit) throw new Error("TP9: unexpected structure");
  return {
    wegentschaedigungStunde: anm[Number(weg[1])],
    zeitversaeumnisStunde: anm[Number(zeit[1])],
  };
})();

// TP 4: Privatanklage, Mediengesetz, Privatbeteiligte. Grundbeträge für Anklagen.
const tp4 = (() => {
  const post = postRange(4);
  const anm = footnotes(post);
  const text = textOf(post);
  checkFactor("TP4", pairs(text), anm);
  const a = text.match(/Zuständigkeit der Bezirksgerichte fallen [\d,]+ Euro; \(Anm\. (\d+)\)/);
  const b = text.match(/wegen sonstiger Vergehen [\d,]+ Euro; \(Anm\. (\d+)\)/);
  if (!a || !b) throw new Error("TP4: unexpected structure");
  return { anklageBezirksgericht: anm[Number(a[1])], anklageSonstige: anm[Number(b[1])] };
})();

const wanted = ["TP1", "TP2", "TP3A", "TP3B", "TP3C"];
for (const w of wanted) if (!blocks.some((b) => b.key === w)) throw new Error(`missing ${w}`);

const body = `// GENERATED by scripts/ratg/generate-tariff.mjs — do not edit by hand.
// Source: ${fm.statute} (${fm.abbreviation}), ${fm.paragraph}, ${fm.kundmachungsorgan}
// Valorised amounts: BGBl. II Nr. 131/2023, in force from 1 May 2023.
// RIS: ${fm.eli} (retrieved ${fm.retrieved_at})

export const RATG_TARIFF_SOURCE = {
  statute: ${JSON.stringify(`${fm.statute} (${fm.abbreviation})`)},
  version: ${JSON.stringify(fm.kundmachungsorgan)},
  valorisation: "BGBl. II Nr. 131/2023, ab 1. Mai 2023",
  valorisedFrom: "2023-05-01",
  eli: ${JSON.stringify(fm.eli)},
  retrievedAt: ${JSON.stringify(fm.retrieved_at)},
} as const;

export interface RatgTariffBlock {
  bands: { upTo: number; amount: number }[];
  stepEvery: number;
  stepAmount: number;
  stepFrom: number;
  stepTo: number;
  extraStepTo: number;
  permille: { over: number; rate: number }[];
  cap: number;
  /** Cap for each further (half-rated) hour of a hearing, where the item has hearings. */
  hourCap: number | null;
}

export const RATG_TARIFF: Record<"TP1" | "TP2" | "TP3A" | "TP3B" | "TP3C", RatgTariffBlock> = ${JSON.stringify(
  Object.fromEntries(
    blocks.filter((b) => wanted.includes(b.key)).map(({ key, ratio, ...rest }) => [key, rest])
  ),
  null,
  2
)};

/** TP 4 Abschnitt I Z 1: Entlohnung für Anklagen; alle anderen Leistungen der TP 4 leiten sich davon ab. */
export const RATG_TP4 = ${JSON.stringify(tp4, null, 2)} as const;

/** TP 5: einfache Schreiben, nach Bemessungsgrundlage. */
export const RATG_TP5 = ${JSON.stringify(tp5, null, 2)} as const;

/** TP 6: das Doppelte der TP 5, höchstens dieser Betrag. */
export const RATG_TP6_CAP = ${JSON.stringify(tp6Cap)};

/** TP 7: je begonnene halbe Stunde; Höchstbeträge für Kanzleikraft bzw. Rechtsanwalt. */
export const RATG_TP7 = ${JSON.stringify(tp7, null, 2)} as const;

/** TP 8: Besprechungen je begonnene halbe Stunde, nach Bemessungsgrundlage. */
export const RATG_TP8 = ${JSON.stringify(tp8, null, 2)} as const;

/** TP 9: je begonnene Stunde. */
export const RATG_TP9 = ${JSON.stringify(tp9, null, 2)} as const;
`;
writeFileSync(OUT, body);
for (const b of blocks)
  console.log(
    b.key,
    "bands",
    b.bands.length,
    "step",
    b.stepAmount,
    "cap",
    b.cap,
    "hourCap",
    b.hourCap,
    "ratio",
    b.ratio
  );
console.log("TP4", tp4, "TP5", tp5, "TP6 cap", tp6Cap, "TP7", tp7, "TP8", tp8, "TP9", tp9);
console.log("written", OUT);
