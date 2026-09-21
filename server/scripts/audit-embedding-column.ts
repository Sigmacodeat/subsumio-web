#!/usr/bin/env bun
/**
 * Checks whether what landed in an embedding column is sound.
 *
 * A re-embedding run writes for hours without anyone watching. Most ways it
 * can go wrong are silent: a shard that quietly embedded nothing, vectors of
 * two models in one column, a provider that started returning a constant, or
 * chunks that were paid for although their page had been deleted meanwhile.
 * None of those show up as an error — they show up as worse answers, months
 * later.
 *
 * Each check answers one question and says what it found, not just pass or
 * fail, because a number that looks wrong is usually the interesting part.
 *
 * Usage:
 *   bun run scripts/audit-embedding-column.ts --column embedding_qwen
 *   bun run scripts/audit-embedding-column.ts --column embedding_qwen --sample 2000
 */

import { parseArgs } from "util";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { embeddableSql } from "../src/core/embedding-run.ts";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    column: { type: "string", default: "embedding_qwen" },
    sample: { type: "string", default: "1000" },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log("Usage: audit-embedding-column.ts [--column embedding_qwen] [--sample 1000]");
  process.exit(0);
}

const COLUMN = values.column as string;
if (!/^[a-z_][a-z0-9_]*$/.test(COLUMN)) {
  console.error(`Spaltenname unzulässig: ${COLUMN}`);
  process.exit(1);
}
const SAMPLE = Number(values.sample);

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  disconnect(): Promise<void>;
  connect(cfg: unknown): Promise<void>;
}

const n = (v: unknown) => Number(v ?? 0).toLocaleString("de-AT");

let failures = 0;
let warnings = 0;

function verdict(ok: boolean, label: string, detail: string, soft = false): void {
  if (ok) {
    console.log(`  ✓ ${label.padEnd(44)} ${detail}`);
  } else if (soft) {
    warnings++;
    console.log(`  ⚠ ${label.padEnd(44)} ${detail}`);
  } else {
    failures++;
    console.log(`  ✗ ${label.padEnd(44)} ${detail}`);
  }
}

async function main() {
  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const cfg = toEngineConfig(fileCfg);
  const engine = (await createEngine(cfg)) as unknown as Engine;
  await engine.connect(cfg);

  const one = async <T>(sql: string, params?: unknown[]): Promise<T> =>
    ((await engine.executeRaw(sql, params)) as T[])[0] as T;

  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Prüfung der Spalte ${COLUMN}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── Wie viel liegt drin, und von welchem Modell ──────────────────────
  const models = (await engine.executeRaw(
    `SELECT coalesce("${COLUMN}_model", '(ohne Angabe)') AS modell, count(*)::text AS anzahl
       FROM content_chunks WHERE "${COLUMN}" IS NOT NULL
      GROUP BY 1 ORDER BY count(*) DESC`
  )) as Array<{ modell: string; anzahl: string }>;
  const total = models.reduce((a, m) => a + Number(m.anzahl), 0);
  console.log(`  Vektoren: ${n(total)}`);
  for (const m of models) console.log(`    ${m.modell} — ${n(m.anzahl)}`);
  console.log("");
  verdict(
    models.length === 1,
    "genau ein Vektorraum",
    models.length === 1 ? models[0]!.modell : `${models.length} verschiedene Modelle — nicht vergleichbar`
  );

  // ── Form der Vektoren ────────────────────────────────────────────────
  // Die Länge misst sich als Wurzel des Skalarprodukts mit sich selbst;
  // pgvector liefert das über den negativen inneren Abstand (<#>).
  const shape = await one<{ dims: string; min_norm: string; max_norm: string; entartet: string }>(
    `SELECT min(vector_dims("${COLUMN}"))::text AS dims,
            round(min(sqrt(("${COLUMN}" <#> "${COLUMN}") * -1))::numeric, 4)::text AS min_norm,
            round(max(sqrt(("${COLUMN}" <#> "${COLUMN}") * -1))::numeric, 4)::text AS max_norm,
            count(*) FILTER (WHERE ("${COLUMN}" <#> "${COLUMN}") * -1 < 0.0001)::text AS entartet
       FROM (SELECT "${COLUMN}" FROM content_chunks
              WHERE "${COLUMN}" IS NOT NULL ORDER BY id LIMIT $1) s`,
    [SAMPLE]
  );
  const allSameDim = await one<{ cnt: string }>(
    `SELECT count(DISTINCT vector_dims("${COLUMN}"))::text AS cnt
       FROM (SELECT "${COLUMN}" FROM content_chunks
              WHERE "${COLUMN}" IS NOT NULL ORDER BY random() LIMIT $1) s`,
    [SAMPLE]
  );
  verdict(Number(allSameDim.cnt) === 1, "einheitliche Dimension", `${shape.dims} bei allen geprüften`);
  verdict(
    Number(shape.min_norm) > 0.99 && Number(shape.max_norm) < 1.01,
    "Vektoren normiert (Länge 1)",
    `${shape.min_norm} bis ${shape.max_norm}`
  );
  verdict(Number(shape.entartet) === 0, "keine Nullvektoren", `${n(shape.entartet)} gefunden`);

  // ── Was NICHT eingebettet sein darf ──────────────────────────────────
  const forbidden = await one<{ geloescht: string; rauschen: string }>(
    `SELECT count(*) FILTER (WHERE p.deleted_at IS NOT NULL)::text AS geloescht,
            count(*) FILTER (WHERE NOT ${embeddableSql("c", "p")})::text AS rauschen
       FROM content_chunks c JOIN pages p ON p.id = c.page_id
      WHERE c."${COLUMN}" IS NOT NULL`
  );
  verdict(
    Number(forbidden.geloescht) === 0,
    "nichts an gelöschten Seiten",
    `${n(forbidden.geloescht)} — bezahlte Vektoren, die nie gesucht werden`
  );
  verdict(
    Number(forbidden.rauschen) === 0,
    "nur Normtext eingebettet",
    `${n(forbidden.rauschen)} Vektoren auf Fragmenten, PDF-Hinweisen oder § 0-Deckblättern`
  );

  const orphan = await one<{ cnt: string }>(
    `SELECT count(*)::text AS cnt FROM content_chunks c
      LEFT JOIN pages p ON p.id = c.page_id
      WHERE c."${COLUMN}" IS NOT NULL AND p.id IS NULL`
  );
  verdict(Number(orphan.cnt) === 0, "keine Vektoren ohne Seite", `${n(orphan.cnt)} verwaist`);

  // ── Unterscheiden die Vektoren überhaupt? ────────────────────────────
  // Ein Anbieter, der stillschweigend immer dasselbe zurückgibt, fällt sonst
  // erst auf, wenn die Suche alles gleich ähnlich findet.
  const spread = await one<{ min_d: string; avg_d: string; max_d: string }>(
    `WITH s AS (SELECT "${COLUMN}" v FROM content_chunks
                 WHERE "${COLUMN}" IS NOT NULL ORDER BY random() LIMIT 60)
     SELECT round(min(a.v <=> b.v)::numeric, 4)::text AS min_d,
            round(avg(a.v <=> b.v)::numeric, 4)::text AS avg_d,
            round(max(a.v <=> b.v)::numeric, 4)::text AS max_d
       FROM s a, s b WHERE a.v <> b.v`
  );
  verdict(
    Number(spread.avg_d) > 0.2 && Number(spread.max_d) > 0.5,
    "Vektoren unterscheiden sich",
    `Abstand ${spread.min_d} … ${spread.avg_d} … ${spread.max_d}`
  );

  // ── Gleicher Text, nahezu gleicher Vektor ───────────────────────────
  // Der Korpus enthält wortgleiche Textbausteine auf verschiedenen Seiten.
  // Ihre Vektoren dürfen sich unterscheiden — der Kontext-Präfix trägt die
  // Geschäftszahl, und das ist gewollt —, aber nur um wenig. Ein großer
  // Abstand zwischen gleichen Texten heißt: mindestens einer der Vektoren
  // wurde aus einer älteren Fassung des Textes gemacht.
  const PREFIX_NOISE = 0.1;
  const repeat = await one<{ paare: string; nah: string; max_d: string }>(
    `WITH d AS (
       SELECT md5(btrim(c.chunk_text)) h, min(c.id) a, max(c.id) b
         FROM content_chunks c
        WHERE c."${COLUMN}" IS NOT NULL AND length(btrim(c.chunk_text)) >= 400
        GROUP BY 1 HAVING count(*) > 1 LIMIT 500)
     SELECT count(*)::text AS paare,
            count(*) FILTER (WHERE (x."${COLUMN}" <=> y."${COLUMN}") < ${PREFIX_NOISE})::text AS nah,
            coalesce(round(max(x."${COLUMN}" <=> y."${COLUMN}")::numeric, 4)::text, '—') AS max_d
       FROM d
       JOIN content_chunks x ON x.id = d.a
       JOIN content_chunks y ON y.id = d.b`
  );
  if (Number(repeat.paare) === 0) {
    verdict(true, "gleicher Text ⇒ nahezu gleicher Vektor", "keine Dubletten in der Stichprobe", true);
  } else {
    verdict(
      repeat.nah === repeat.paare,
      "gleicher Text ⇒ nahezu gleicher Vektor",
      `${n(repeat.nah)} von ${n(repeat.paare)} Paaren unter ${PREFIX_NOISE}, größter Abstand ${repeat.max_d}`
    );
  }

  // ── Vektor jünger als die Seite ──────────────────────────────────────
  // Der eigentliche Nachweis für Veraltung: Titel und Frontmatter der Seite
  // gehen in den Präfix ein, also ist ein Vektor, dessen Seite sich danach
  // geändert hat, möglicherweise aus anderem Text gemacht. Muss vor dem
  // Umschalten null sein (guard-scaffold-embedding.ts --sweep).
  const stale = await one<{ cnt: string }>(
    `SELECT count(*)::text AS cnt FROM content_chunks c JOIN pages p ON p.id = c.page_id
      WHERE c."${COLUMN}" IS NOT NULL AND p.updated_at > c."${COLUMN}_embedded_at"`
  );
  verdict(
    Number(stale.cnt) === 0,
    "kein Vektor älter als seine Seite",
    `${n(stale.cnt)} — Seite nach dem Einbetten geändert`
  );

  // ── Schutz gegen künftige Veraltung ──────────────────────────────────
  const trigger = await one<{ cnt: string }>(
    `SELECT count(*)::text AS cnt FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = 'content_chunks' AND t.tgname = $1`,
    [`trg_clear_${COLUMN}`]
  );
  verdict(
    Number(trigger.cnt) > 0,
    "Trigger gegen Textänderungen aktiv",
    Number(trigger.cnt) > 0 ? "ein geänderter Text löscht seinen Vektor" : "FEHLT — Re-Importe hinterlassen veraltete Vektoren"
  );

  // ── Fragt die Suche im selben Raum? ──────────────────────────────────
  // Nach dem Umschalten bettet die Suche jede Frage mit dem Modell ein, das
  // die Umgebung vorgibt (SUBSUMIO_EMBEDDING_MODEL hat Vorrang vor allem).
  // Weicht es vom Modell der gespeicherten Vektoren ab, vergleicht sie Äpfel
  // mit Birnen und liefert trotzdem Treffer — nur die falschen, ohne Fehler.
  // Für die Live-Spalte ist das der wichtigste Einzeltest dieser Prüfung.
  const searchModel = fileCfg.embedding_model ?? "(nicht gesetzt)";
  const searchDims = fileCfg.embedding_dimensions;
  const storedSig = models.length === 1 ? models[0]!.modell : "";
  const storedModel = storedSig.replace(/:\d+$/, "");
  const sameSpace =
    storedModel === searchModel || storedModel === searchModel.replace(/:\d+$/, "");
  if (COLUMN === "embedding") {
    verdict(
      sameSpace,
      "Suche fragt im Raum der Vektoren",
      sameSpace
        ? `${searchModel}${searchDims ? `:${searchDims}` : ""}`
        : `Suche: ${searchModel} — Vektoren: ${storedModel}. SUBSUMIO_EMBEDDING_MODEL anpassen und web + engine neu starten.`
    );
  } else {
    console.log(
      `  · Suche nutzt derzeit ${searchModel} über die Spalte embedding; ` +
        `diese Spalte (${storedModel}) wird erst nach dem Umschalten gefragt.`
    );
  }

  // ── Deckung je Quelle ────────────────────────────────────────────────
  // Ein Arbeiter, dessen Fenster leer blieb oder der früh starb, zeigt sich
  // als Quelle, die weit hinter den anderen liegt.
  const perSource = (await engine.executeRaw(
    `SELECT p.source_id,
            count(*)::text AS kandidaten,
            count(c."${COLUMN}")::text AS fertig,
            round(100.0 * count(c."${COLUMN}") / greatest(count(*), 1))::text AS prozent
       FROM content_chunks c JOIN pages p ON p.id = c.page_id
      WHERE p.deleted_at IS NULL AND ${embeddableSql("c", "p")}
      GROUP BY 1 HAVING count(*) > 1000
      ORDER BY 100.0 * count(c."${COLUMN}") / greatest(count(*), 1) ASC`
  )) as Array<{ source_id: string; kandidaten: string; fertig: string; prozent: string }>;

  console.log("\n  Deckung je Quelle (aufsteigend):");
  for (const s of perSource.slice(0, 8)) {
    console.log(
      `    ${s.source_id.padEnd(28)} ${String(s.prozent).padStart(3)} %   ${n(s.fertig)} von ${n(s.kandidaten)}`
    );
  }
  if (perSource.length > 8) console.log(`    … ${perSource.length - 8} weitere Quellen darüber`);

  console.log("");
  if (failures > 0) {
    console.log(`  ${failures} Prüfung(en) fehlgeschlagen, ${warnings} Hinweis(e).`);
    await engine.disconnect();
    process.exit(1);
  }
  console.log(`  Alle Prüfungen bestanden${warnings > 0 ? `, ${warnings} Hinweis(e)` : ""}.`);
  await engine.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
