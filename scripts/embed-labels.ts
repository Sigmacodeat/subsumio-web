/**
 * Poly-Vector Label Embedding Backfill
 *
 * Embeds all unembedded content_chunk_labels using the same
 * openrouter:openai/text-embedding-3-small model as the main chunks.
 *
 * Deduplicates label_text before embedding to minimize API calls.
 *
 * Usage: bun run scripts/embed-labels.ts
 */

import { readFileSync } from "fs";

// Load env from server/.env
const envFile = readFileSync(new URL("../server/.env", import.meta.url), "utf-8");
for (const line of envFile.split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].trim();
  }
}

const DB_URL = "postgresql://sigmabrain@localhost:15432/sigmabrain";
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY_FALLBACK;
const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIMS = 1536;
const BATCH_SIZE = 100;

if (!OPENROUTER_KEY) {
  console.error("No OPENROUTER_API_KEY found in server/.env");
  process.exit(1);
}

interface LabelRow {
  id: number;
  label_text: string;
}

async function main() {
  // Dynamic import of pg
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: DB_URL });

  // 1. Fetch all unembedded labels
  const client = await pool.connect();
  const { rows } = await client.query<LabelRow>(
    `SELECT id, label_text FROM content_chunk_labels WHERE embedding IS NULL ORDER BY id`
  );
  console.log(`Found ${rows.length} unembedded labels`);

  if (rows.length === 0) {
    console.log("All labels already embedded. Nothing to do.");
    client.release();
    await pool.end();
    return;
  }

  // 2. Deduplicate label_text → unique texts
  const uniqueTexts = [...new Set(rows.map((r) => r.label_text))];
  console.log(`Deduplicated: ${uniqueTexts.length} unique label texts (from ${rows.length} rows)`);

  // 3. Embed in batches
  const textToEmbedding = new Map<string, number[]>();
  let embedded = 0;

  for (let i = 0; i < uniqueTexts.length; i += BATCH_SIZE) {
    const batch = uniqueTexts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(uniqueTexts.length / BATCH_SIZE);
    console.log(`Embedding batch ${batchNum}/${totalBatches} (${batch.length} texts)...`);

    const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMS,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API error (batch ${batchNum}): ${response.status} ${errorText}`);
      throw new Error(`Embedding API failed: ${response.status}`);
    }

    const data = (await response.json()) as { data: { embedding: number[] }[] };

    for (let j = 0; j < batch.length; j++) {
      textToEmbedding.set(batch[j], data.data[j].embedding);
    }

    embedded += batch.length;
    console.log(`  Embedded ${embedded}/${uniqueTexts.length} unique texts`);

    // Small delay to avoid rate limits
    if (i + BATCH_SIZE < uniqueTexts.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // 4. Update DB rows
  console.log(`\nUpdating ${rows.length} DB rows...`);
  let updated = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const embedding = textToEmbedding.get(row.label_text);
    if (!embedding) {
      console.error(`Missing embedding for label_text: ${row.label_text}`);
      continue;
    }

    const vectorStr = `[${embedding.join(",")}]`;
    await client.query(
      `UPDATE content_chunk_labels SET embedding = $1::vector, embedded_at = now(), model = $2 WHERE id = $3`,
      [vectorStr, `openrouter:openai/text-embedding-3-small:1536`, row.id]
    );
    updated++;

    if (updated % 500 === 0) {
      console.log(`  Updated ${updated}/${rows.length} rows`);
    }
  }

  console.log(`\n✅ Done! Embedded ${updated}/${rows.length} label rows`);
  console.log(`   Unique texts embedded: ${uniqueTexts.length}`);
  console.log(`   API calls: ${Math.ceil(uniqueTexts.length / BATCH_SIZE)}`);

  // 5. Verify
  const verify = await client.query(
    `SELECT COUNT(*) as total, COUNT(embedding) as embedded FROM content_chunk_labels`
  );
  console.log(
    `\nVerification: ${verify.rows[0].embedded}/${verify.rows[0].total} labels now embedded`
  );

  client.release();
  await pool.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
