export {};
const data = await Bun.file("/tmp/gbrain-forks-all.json").json();
console.log("Gesamt Forks:", data.length);

// Nach Push-Monat
const byMonth: Record<string, number> = {};
for (const f of data) {
  const d = new Date(f.pushed_at);
  const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  byMonth[key] = (byMonth[key] || 0) + 1;
}
console.log("\nNach Push-Monat:");
for (const [k, v] of Object.entries(byMonth).sort()) {
  console.log(`  ${k}: ${v}`);
}

// Top 30 nach Stars
const byStars = [...data]
  .sort((a, b) => b.stargazers_count - a.stargazers_count)
  .slice(0, 30);
console.log("\nTop 30 nach Stars:");
for (const f of byStars) {
  console.log(
    `  ${f.full_name}: ${f.stargazers_count} stars, pushed ${f.pushed_at.slice(0,10)}, ${f.open_issues_count} issues, size ${f.size}KB, desc: ${f.description?.slice(0,60) || "-"}`
  );
}

// Umbenannte Repos
const renamed = data.filter((f: any) => f.name !== "gbrain");
console.log("\nUmbenannte Repos:", renamed.length);
for (const f of renamed
  .sort((a: any, b: any) => new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime())
  .slice(0, 30)) {
  console.log(`  ${f.full_name}: ${f.stargazers_count} stars, pushed ${f.pushed_at.slice(0,10)}, ${f.description?.slice(0,60) || "-"}`);
}

// Mit open issues > 0
const withIssues = data
  .filter((f: any) => f.open_issues_count > 0)
  .sort((a: any, b: any) => b.open_issues_count - a.open_issues_count);
console.log("\nMit offenen Issues:", withIssues.length);
for (const f of withIssues.slice(0, 20)) {
  console.log(`  ${f.full_name}: ${f.open_issues_count} issues, ${f.stargazers_count} stars, pushed ${f.pushed_at.slice(0,10)}`);
}

// Größte Repos (size in KB)
const bySize = [...data]
  .sort((a, b) => b.size - a.size)
  .slice(0, 20);
console.log("\nGrößte Repos (KB):");
for (const f of bySize) {
  console.log(`  ${f.full_name}: ${f.size}KB, pushed ${f.pushed_at.slice(0,10)}`);
}
