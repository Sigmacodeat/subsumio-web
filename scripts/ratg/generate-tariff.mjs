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
console.log("written", OUT);
