import postgres from "postgres";
const sql = postgres("postgres://sigmabrain:2bfa7d4107f0b40e171cb508f27a9a703501b160d61957f0@localhost:15432/sigmabrain?sslmode=disable", { max: 2, ssl: false, onnotice: () => {} });

async function main() {
  // Check content_chunks columns
  const cols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'content_chunks' ORDER BY ordinal_position`;
  console.log("content_chunks columns:");
  for (const c of cols) console.log("  ", c.column_name, "—", c.data_type);

  // Total chunks
  const totalChunks = await sql`SELECT COUNT(*) as c FROM content_chunks`;
  console.log("\nTotal content_chunks:", totalChunks[0].c);

  // Chunks for new pages
  const newChunks = await sql`SELECT COUNT(*) as c FROM content_chunks WHERE page_id IN (SELECT id FROM pages WHERE created_at > NOW() - INTERVAL '3 hours')`;
  console.log("Chunks for new pages (last 3h):", newChunks[0].c);

  // Pending embeddings (null embedding)
  const pendingEmbed = await sql`SELECT COUNT(*) as c FROM content_chunks WHERE embedding IS NULL`;
  console.log("Chunks with NULL embedding:", pendingEmbed[0].c);

  // Check new pages that have NO chunks
  const noChunks = await sql`
    SELECT p.slug FROM pages p
    LEFT JOIN content_chunks c ON c.page_id = p.id
    WHERE p.created_at > NOW() - INTERVAL '3 hours' AND c.id IS NULL
    LIMIT 10
  `;
  if (noChunks.length > 0) {
    console.log("\nNew pages WITHOUT chunks:");
    for (const p of noChunks) console.log("  ", p.slug);
  } else {
    console.log("\nAll new pages have chunks ✅");
  }

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
