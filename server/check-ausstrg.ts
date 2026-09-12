import postgres from "postgres";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const sql = postgres(databaseUrl, { max: 2, ssl: false, onnotice: () => {} });

async function main() {
  const r1 =
    await sql`SELECT COUNT(*) as c FROM pages WHERE slug LIKE 'legal/statutes/at/au-strg%'`;
  console.log("au-strg in legal/statutes:", r1[0].c);
  const r2 = await sql`SELECT COUNT(*) as c FROM pages WHERE slug LIKE 'law/at/au-strg%'`;
  console.log("au-strg in law/:", r2[0].c);
  const r3 = await sql`SELECT COUNT(*) as c FROM pages WHERE slug LIKE '%au-strg%'`;
  console.log("au-strg total:", r3[0].c);

  // Also check außstrg (the old slug used different encoding)
  const r4 = await sql`SELECT COUNT(*) as c FROM pages WHERE slug LIKE '%au%strg%'`;
  console.log("au*strg total:", r4[0].c);

  // Check what the split-statute script would produce for au-strg
  const { splitStatute } = await import("./src/core/legal/split-statute.ts");
  const raw = await Bun.file("/Users/msc/subsumio-web/law-corpus/at/au-strg.md").text();
  const { meta, sections } = splitStatute(raw);
  console.log(`\nau-strg.md: ${sections.length} sections, abbr=${meta.abbreviation}`);
  console.log(
    "First 3 section IDs:",
    sections.slice(0, 3).map((s) => s.id)
  );

  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
