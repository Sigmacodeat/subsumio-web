export {};
const data = await Bun.file("/tmp/gbrain-forks-all.json").json();

// Scoring-Funktion für jeden Fork
function score(f: any): number {
  let s = 0;
  // Stars = Community-Interesse
  s += f.stargazers_count * 10;
  // Forks von diesem Fork
  s += f.forks_count * 5;
  // Offene Issues = aktive Entwicklung/Diskussion
  s += f.open_issues_count * 3;
  // Umbenannt = eigene Vision
  if (f.name !== "gbrain") s += 20;
  // Größenabweichung = Code-Änderungen
  const baseSize = 61022; // ca. Original-Größe
  const sizeDiff = Math.abs(f.size - baseSize);
  if (sizeDiff > 1000) s += 5;
  if (sizeDiff > 10000) s += 10;
  // Recent push = aktive Entwicklung
  const daysSincePush = Math.floor((Date.now() - new Date(f.pushed_at).getTime()) / 86400000);
  if (daysSincePush < 7) s += 15;
  else if (daysSincePush < 30) s += 10;
  else if (daysSincePush < 60) s += 5;

  return s;
}

const scored = data.map((f: any) => ({ ...f, _score: score(f) }));
scored.sort((a: any, b: any) => b._score - a._score);

console.log("=== TOP 50 INTERESSANTESTE FORKS (nach Score) ===\n");
for (let i = 0; i < 50; i++) {
  const f = scored[i];
  const daysSincePush = Math.floor((Date.now() - new Date(f.pushed_at).getTime()) / 86400000);
  console.log(
    `${String(i + 1).padStart(2)}. ${f.full_name} (Score: ${f._score})\n` +
      `    Stars: ${f.stargazers_count} | Forks: ${f.forks_count} | Issues: ${f.open_issues_count}\n` +
      `    Size: ${f.size}KB | Pushed: ${f.pushed_at.slice(0, 10)} (${daysSincePush}d ago)\n` +
      `    Desc: ${f.description?.slice(0, 80) || "-"}\n` +
      `    Compare: https://github.com/garrytan/gbrain/compare/master...${f.owner.login}:${f.name}:master\n`
  );
}

// Speichere Top 100 für Batch-Analyse
const top100 = scored.slice(0, 100).map((f: any) => ({
  rank: 0,
  full_name: f.full_name,
  owner: f.owner.login,
  repo: f.name,
  html_url: f.html_url,
  score: f._score,
  stars: f.stargazers_count,
  forks: f.forks_count,
  open_issues: f.open_issues_count,
  size_kb: f.size,
  pushed_at: f.pushed_at,
  description: f.description,
  compare_url: `https://github.com/garrytan/gbrain/compare/master...${f.owner.login}:${f.name}:master`,
}));
for (let i = 0; i < top100.length; i++) top100[i].rank = i + 1;

await Bun.write("/tmp/gbrain-forks-top100.json", JSON.stringify(top100, null, 2));
console.log("\nGespeichert: /tmp/gbrain-forks-top100.json");

// Statistik
console.log("\n=== STATISTIK ===");
console.log(`Gesamt Forks: ${data.length}`);
console.log(`Mit Umbenennung: ${data.filter((f: any) => f.name !== "gbrain").length}`);
console.log(`Mit Stars > 0: ${data.filter((f: any) => f.stargazers_count > 0).length}`);
console.log(`Mit Issues > 0: ${data.filter((f: any) => f.open_issues_count > 0).length}`);
console.log(
  `Pushed < 7 Tage: ${
    data.filter((f: any) => {
      const d = Math.floor((Date.now() - new Date(f.pushed_at).getTime()) / 86400000);
      return d < 7;
    }).length
  }`
);
