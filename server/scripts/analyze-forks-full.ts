/**
 * Vollständige Fork-Analyse mit GitHub Token
 * Analysiert die Top N Forks: Commits, neue Dateien, modifizierte Dateien
 * Output: /tmp/gbrain-forks-detailed.json + /tmp/gbrain-forks-detailed.md
 */
export {};

// ---------------------------------------------------------------
// 1. KONFIGURATION
// ---------------------------------------------------------------
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error("GITHUB_TOKEN muss gesetzt sein.");
  process.exit(1);
}

const TOP_N = 100; // Wie viele der Top-Forks analysieren
const COMMITS_PER_FORK = 100; // Max Commits pro Fork
const RATE_LIMIT_PAUSE = 800; // ms zwischen Requests

const OUT_DETAIL = "/tmp/gbrain-forks-detailed.json";
const OUT_REPORT = "/tmp/gbrain-forks-detailed.md";

// ---------------------------------------------------------------
// 2. HELFER
// ---------------------------------------------------------------

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  Authorization: `Bearer ${TOKEN}`,
};

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function githubFetch(url: string, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    await sleep(RATE_LIMIT_PAUSE);
    const res = await fetch(url, { headers });

    if (res.status === 403) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      const reset = res.headers.get("x-ratelimit-reset");
      console.error(`Rate limit! remaining=${remaining}, reset=${reset}`);
      if (remaining === "0" && reset) {
        const waitSec = parseInt(reset) - Math.floor(Date.now() / 1000) + 5;
        console.log(`Warte ${waitSec}s...`);
        await sleep(waitSec * 1000);
        continue;
      }
    }

    if (res.status === 404 || res.status === 409) return null;
    if (!res.ok) {
      const body = await res.text();
      console.error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      if (i < retries) continue;
      return null;
    }

    // Log rate limit status
    const rateRemaining = res.headers.get("x-ratelimit-remaining");
    const rateTotal = res.headers.get("x-ratelimit-limit");
    if (rateRemaining) {
      process.stdout.write(`\rRate: ${rateRemaining}/${rateTotal}  `);
    }

    return res.json();
  }
  return null;
}

async function fetchCommits(owner: string, repo: string, since: string): Promise<any[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits?since=${since}&per_page=${COMMITS_PER_FORK}`;
  const data = await githubFetch(url);
  return Array.isArray(data) ? data : [];
}

async function fetchCompare(
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string
): Promise<any> {
  const url = `https://api.github.com/repos/garrytan/gbrain/compare/master...${owner}:${repo}:master`;
  const data = await githubFetch(url);
  return data;
}

async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${ref}`;
  const data = await githubFetch(url);
  if (!data || !data.content) return null;
  try {
    return Buffer.from(data.content, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

async function fetchRepoFiles(owner: string, repo: string, ref: string): Promise<any[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`;
  const data = await githubFetch(url);
  return data?.tree || [];
}

// ---------------------------------------------------------------
// 3. HAUPTANALYSE
// ---------------------------------------------------------------

async function analyzeFork(fork: any): Promise<any> {
  const owner = fork.owner;
  const repo = fork.repo;
  const since =
    new Date(fork.pushed_at).getTime() > new Date("2026-01-01").getTime()
      ? new Date(Date.now() - 90 * 86400000).toISOString() // Letzte 90 Tage
      : new Date(Date.now() - 30 * 86400000).toISOString(); // Letzte 30 Tage

  console.log(`\n=== [${fork.rank}] ${owner}/${repo} ===`);

  // 3a. Commits
  const commits = await fetchCommits(owner, repo, since);
  console.log(`  Commits: ${commits.length}`);

  const commitMessages = commits.map((c: any) => ({
    sha: c.sha?.slice(0, 7),
    message: c.commit?.message?.split("\n")[0],
    author: c.commit?.author?.name,
    date: c.commit?.author?.date,
  }));

  // 3b. Neue/modifizierte Files (Compare)
  let compareResult: any = null;
  try {
    compareResult = await fetchCompare(owner, repo, "master", "master");
  } catch {
    // Vergleich könnte zu groß sein
  }

  const newFiles: string[] = [];
  const modifiedFiles: string[] = [];
  const deletedFiles: string[] = [];

  if (compareResult?.files) {
    for (const f of compareResult.files) {
      if (f.status === "added") newFiles.push(f.filename);
      else if (f.status === "modified") modifiedFiles.push(f.filename);
      else if (f.status === "removed") deletedFiles.push(f.filename);
    }
  }

  console.log(`  Neue Dateien: ${newFiles.length}`);
  console.log(`  Modifiziert: ${modifiedFiles.length}`);
  console.log(`  Gelöscht: ${deletedFiles.length}`);

  // 3c. Neue Skills/Dateien untersuchen
  const interestingNew: string[] = [];
  for (const f of newFiles) {
    if (f.includes("skills/") && f.endsWith(".md") && !f.includes("/migrations/")) {
      interestingNew.push(f);
    }
    if (f.endsWith(".json") && f.includes("skill")) interestingNew.push(f);
    if (f.includes("connector") && f.endsWith(".ts")) interestingNew.push(f);
    if (f.includes("docker")) interestingNew.push(f);
  }

  const interestingModified: string[] = [];
  for (const f of modifiedFiles) {
    if (f === "README.md" || f === "package.json" || f === "gbrain.yml") {
      interestingModified.push(f);
    }
    if (f.includes("src/") && f.endsWith(".ts") && !f.includes(".test.")) {
      interestingModified.push(f);
    }
  }

  // 3d. Feature-Keywords aus Commit-Messages extrahieren
  const featureKeywords = [
    "skill",
    "feature",
    "add",
    "new",
    "oauth",
    "docker",
    "deploy",
    "manifest",
    "friction",
    "research",
    "ingest",
    "connector",
    "plugin",
    "integration",
    "ui",
    "web",
    "api",
    "auth",
    "sync",
    "import",
    "export",
    "migration",
    "test",
    "fix",
    "improve",
    "optimize",
    "refactor",
  ];

  const keywordMatches: Record<string, number> = {};
  for (const c of commitMessages) {
    const msg = (c.message || "").toLowerCase();
    for (const kw of featureKeywords) {
      if (msg.includes(kw)) {
        keywordMatches[kw] = (keywordMatches[kw] || 0) + 1;
      }
    }
  }

  return {
    rank: fork.rank,
    owner,
    repo,
    html_url: fork.html_url,
    score: fork.score,
    stars: fork.stars,
    forks: fork.forks,
    open_issues: fork.open_issues,
    pushed_at: fork.pushed_at,
    description: fork.description,
    commits_count: commits.length,
    commit_messages: commitMessages.slice(0, 20),
    new_files: newFiles.slice(0, 50),
    modified_files: modifiedFiles.slice(0, 30),
    deleted_files: deletedFiles.slice(0, 20),
    interesting_new: interestingNew,
    interesting_modified: interestingModified,
    keyword_matches: keywordMatches,
    compare_url: fork.compare_url,
  };
}

// ---------------------------------------------------------------
// 4. REPORT
// ---------------------------------------------------------------

function generateReport(results: any[]): string {
  const lines: string[] = [
    `# GBrain Fork-Analyse: Detail-Report`,
    ``,
    `**Generiert:** ${new Date().toISOString()}`,
    `**Analysierte Forks:** ${results.length}`,
    ``,
  ];

  // Kategorisierung
  const withSkills = results.filter(
    (r) =>
      r.interesting_new.some((f: string) => f.includes("skills/")) ||
      Object.keys(r.keyword_matches).some((k) => k === "skill")
  );

  const withNewFeatures = results.filter(
    (r) => r.interesting_new.length > 0 || r.commits_count > 5
  );

  const withCodeChanges = results.filter((r) =>
    r.modified_files.some((f: string) => f.includes("src/"))
  );

  lines.push(
    `## Zusammenfassung`,
    ``,
    `- **Mit neuen Skills:** ${withSkills.length}`,
    `- **Mit Code-Änderungen:** ${withCodeChanges.length}`,
    `- **Mit neuen Features:** ${withNewFeatures.length}`,
    `- **Mit Commits > 5:** ${results.filter((r) => r.commits_count > 5).length}`,
    ``
  );

  // Top nach Commits
  lines.push(`## Top 20 nach Commit-Anzahl`, ``);
  const byCommits = [...results].sort((a, b) => b.commits_count - a.commits_count).slice(0, 20);
  for (const r of byCommits) {
    lines.push(
      `${r.rank}. **${r.owner}/${r.repo}** — ${r.commits_count} commits, ${r.stars} stars`,
      `   - URL: ${r.html_url}`,
      `   - Neue Dateien: ${r.new_files.length} | Modifiziert: ${r.modified_files.length}`,
      `   - Keywords: ${
        Object.entries(r.keyword_matches)
          .sort((a: any, b: any) => b[1] - a[1])
          .slice(0, 5)
          .map(([k, v]) => `${k}(${v})`)
          .join(", ") || "-"
      }`,
      ``
    );
  }

  // Neue Skills detailliert
  lines.push(`## Neue Skills & Konventionen`, ``);
  for (const r of withSkills) {
    if (
      r.interesting_new.length === 0 &&
      Object.keys(r.keyword_matches).filter((k) => k === "skill").length === 0
    )
      continue;
    lines.push(
      `### ${r.owner}/${r.repo}`,
      `- Commits: ${r.commits_count} | Stars: ${r.stars}`,
      `- Neue interessante Dateien:`,
      ...r.interesting_new.map((f: string) => `  - \`${f}\``),
      `- Keywords: ${
        Object.entries(r.keyword_matches)
          .sort((a: any, b: any) => b[1] - a[1])
          .slice(0, 8)
          .map(([k, v]) => `${k}(${v})`)
          .join(", ") || "-"
      }`,
      `- Compare: ${r.compare_url}`,
      ``
    );
  }

  // Komplette Top-Listen
  lines.push(`## Alle ${results.length} analysierten Forks`, ``);
  for (const r of results) {
    const hasChanges = r.new_files.length > 0 || r.modified_files.length > 0;
    lines.push(
      `${r.rank}. **${r.owner}/${r.repo}** ${hasChanges ? "📦" : ""} ${r.interesting_new.length > 0 ? "✨" : ""}`,
      `   Commits: ${r.commits_count} | Neue: ${r.new_files.length} | Modifiziert: ${r.modified_files.length} | Stars: ${r.stars}`,
      `   URL: ${r.html_url}`,
      ``
    );
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------
// 5. MAIN
// ---------------------------------------------------------------

async function main() {
  console.log("=== GBRAIN FORK DETAIL-ANALYSE ===");
  console.log(`Token gesetzt: ${TOKEN ? "JA" : "NEIN"}`);
  console.log(`Top ${TOP_N} Forks werden analysiert...\n`);

  // Lade Top 100
  const topForks = await Bun.file("/tmp/gbrain-forks-top100.json").json();
  const toAnalyze = topForks.slice(0, TOP_N);
  console.log(`Geladen: ${toAnalyze.length} Forks`);

  const results: any[] = [];
  for (let i = 0; i < toAnalyze.length; i++) {
    const fork = toAnalyze[i];
    try {
      const result = await analyzeFork(fork);
      results.push(result);
    } catch (err) {
      console.error(`FEHLER bei ${fork.owner}/${fork.repo}:`, err);
      results.push({
        rank: fork.rank,
        owner: fork.owner,
        repo: fork.repo,
        error: String(err),
        ...fork,
      });
    }

    // Zwischenspeicherung
    if ((i + 1) % 10 === 0) {
      await Bun.write(OUT_DETAIL + ".partial", JSON.stringify(results, null, 2));
      console.log(`\n--- Zwischenspeicherung nach ${i + 1}/${toAnalyze.length} ---`);
    }
  }

  // Final speichern
  await Bun.write(OUT_DETAIL, JSON.stringify(results, null, 2));
  console.log(`\nGespeichert: ${OUT_DETAIL}`);

  // Report generieren
  const report = generateReport(results);
  await Bun.write(OUT_REPORT, report);
  console.log(`Gespeichert: ${OUT_REPORT}`);

  // Zusammenfassung
  console.log("\n=== ZUSAMMENFASSUNG ===");
  console.log(`Analysiert: ${results.length}`);
  console.log(`Mit Commits > 0: ${results.filter((r) => r.commits_count > 0).length}`);
  console.log(`Mit Commits > 5: ${results.filter((r) => r.commits_count > 5).length}`);
  console.log(
    `Mit neuen Skills: ${results.filter((r) => r.interesting_new?.some((f: string) => f.includes("skills/"))).length}`
  );
  console.log(
    `Mit Code-Änderungen: ${results.filter((r) => r.modified_files?.some((f: string) => f.includes("src/"))).length}`
  );
  console.log(`Mit neuen Dateien: ${results.filter((r) => r.new_files?.length > 0).length}`);
}

main().catch((err) => {
  console.error("FEHLER:", err);
  process.exit(1);
});
