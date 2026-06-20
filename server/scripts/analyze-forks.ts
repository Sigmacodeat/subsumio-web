/**
 * Systematische Fork-Analyse für gbrain
 * Sammelt ALLE Forks via GitHub API, sortiert nach Aktivität,
 * und analysiert Commits/Diffs für übernahmewürdige Features.
 */
export {};

// ---------------------------------------------------------------
// 1. KONFIGURATION
// ---------------------------------------------------------------
const OWNER = "garrytan";
const REPO = "gbrain";
const PER_PAGE = 100;        // GitHub API max
const SORT = "newest";       // newest = nach Erstelldatum (API limit); client-side sort nach pushed_at

// Filter: nur Forks die seit diesem Datum aktiv waren
const CUTOFF_DATE = new Date("2026-03-01"); // ca. letzte 2-3 Monate

// Pfade zum Speichern
const OUT_ALL = "/tmp/gbrain-forks-all.json";
const OUT_ACTIVE = "/tmp/gbrain-forks-active.json";
const OUT_REPORT = "/tmp/gbrain-forks-report.md";

// ---------------------------------------------------------------
// 2. HELFER
// ---------------------------------------------------------------

async function fetchAllForks(token?: string): Promise<any[]> {
  const forks: any[] = [];
  let page = 1;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  while (true) {
    const url =
      `https://api.github.com/repos/${OWNER}/${REPO}/forks?` +
      `sort=${SORT}&per_page=${PER_PAGE}&page=${page}`;

    console.log(`→ Seite ${page}: ${url}`);
    const res = await fetch(url, { headers });

    if (res.status === 403) {
      const reset = res.headers.get("x-ratelimit-reset");
      const msg = res.headers.get("x-ratelimit-remaining");
      console.error(`Rate limit! Remaining: ${msg}, Reset: ${reset}`);
      const body = await res.text();
      console.error(body);
      throw new Error("GitHub API rate limit exceeded");
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body}`);
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;

    forks.push(...data);
    console.log(`  Erhalten: ${data.length} Forks (Total: ${forks.length})`);

    if (data.length < PER_PAGE) break;
    page++;

    // Rate-limit Vorsicht: 1s Pause zwischen Requests
    await new Promise((r) => setTimeout(r, 1000));
  }

  return forks;
}

async function fetchCommitsSinceFork(fork: any, token?: string): Promise<any[]> {
  const owner = fork.owner.login;
  const repo = fork.name;
  const createdAt = fork.created_at;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // Alle Commits im Fork seit Erstellungsdatum
  const url =
    `https://api.github.com/repos/${owner}/${repo}/commits?` +
    `since=${createdAt}&per_page=100`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    if (res.status === 409) return []; // empty repo
    console.warn(`  Commits fetch failed for ${owner}/${repo}: HTTP ${res.status}`);
    return [];
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function formatBytes(n: number): string {
  if (n === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return parseFloat((n / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// ---------------------------------------------------------------
// 3. HAUPTLOGIK
// ---------------------------------------------------------------

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log("⚠️  Kein GITHUB_TOKEN gesetzt. Rate limit: 60 req/h (nur ~60 Forks/Details möglich)");
    console.log("   Setze: export GITHUB_TOKEN=ghp_xxxx  (Classic oder Fine-Grained PAT)");
  } else {
    console.log("✅ GitHub Token erkannt. Rate limit: 5000 req/h");
  }

  // 3a. Alle Forks sammeln
  console.log("\n=== 1. ALLE FORKS SAMMELN ===");
  const allForks = await fetchAllForks(token);

  // Client-seitig nach pushed_at sortieren (neueste zuerst)
  allForks.sort((a: any, b: any) =>
    new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime()
  );

  await Bun.write(OUT_ALL, JSON.stringify(allForks, null, 2));
  console.log(`   Gespeichert: ${OUT_ALL} (${allForks.length} Forks)`);

  // 3b. Nach Aktivität filtern
  console.log(`\n=== 2. AKTIVE FORKS FILTERN (seit ${CUTOFF_DATE.toISOString().slice(0,10)}) ===`);
  const activeForks = allForks.filter((f: any) => {
    const pushed = new Date(f.pushed_at);
    return pushed >= CUTOFF_DATE;
  });
  console.log(`   Aktive Forks: ${activeForks.length} / ${allForks.length}`);

  // Rate-limit Schutz: ohne Token nur Top N Forks detailliert
  const MAX_DETAIL_FORKS = token ? Infinity : 45;
  const forksToAnalyze = activeForks.slice(0, MAX_DETAIL_FORKS);
  if (!token && activeForks.length > MAX_DETAIL_FORKS) {
    console.log(`   ⚠️  Rate-Limit-Schutz: Nur Top ${MAX_DETAIL_FORKS} von ${activeForks.length} aktiven Forks werden analysiert.`);
    console.log(`      Setze GITHUB_TOKEN um alle zu analysieren.`);
  }

  // 3c. Details für aktive Forks
  console.log("\n=== 3. DETAILS FÜR AKTIVE FORKS ===");
  const enriched = [];
  for (const fork of forksToAnalyze) {
    const owner = fork.owner.login;
    const repo = fork.name;
    const pushed = new Date(fork.pushed_at);
    const created = new Date(fork.created_at);
    const ageDays = Math.floor((Date.now() - created.getTime()) / 86400000);

    console.log(`\n[${enriched.length + 1}/${activeForks.length}] ${owner}/${repo}`);
    console.log(`   Stars: ${fork.stargazers_count} | Forks: ${fork.forks_count} | Open Issues: ${fork.open_issues_count}`);
    console.log(`   Created: ${created.toISOString().slice(0,10)} (${ageDays}d ago) | Pushed: ${pushed.toISOString().slice(0,10)}`);
    console.log(`   Size: ${formatBytes(fork.size * 1024)} | Default Branch: ${fork.default_branch}`);

    // Commits holen
    const commits = await fetchCommitsSinceFork(fork, token);
    const nonMergeCommits = commits.filter((c: any) => {
      const msg = (c.commit?.message ?? "").toLowerCase();
      return !(msg.startsWith("merge pull request") || msg.startsWith("merge branch"));
    });

    console.log(`   Commits seit Fork: ${commits.length} (davon ${nonMergeCommits.length} nicht-Merge)`);

    enriched.push({
      owner,
      repo,
      full_name: fork.full_name,
      html_url: fork.html_url,
      stars: fork.stargazers_count,
      forks: fork.forks_count,
      open_issues: fork.open_issues_count,
      size_kb: fork.size,
      created_at: fork.created_at,
      pushed_at: fork.pushed_at,
      updated_at: fork.updated_at,
      default_branch: fork.default_branch,
      description: fork.description,
      commits_total: commits.length,
      commits_meaningful: nonMergeCommits.length,
      commit_messages: nonMergeCommits.slice(0, 10).map((c: any) => ({
        sha: c.sha?.slice(0, 7),
        message: c.commit?.message?.split("\n")[0],
        author: c.commit?.author?.name,
        date: c.commit?.author?.date,
      })),
    });

    await new Promise((r) => setTimeout(r, 500));
  }

  await Bun.write(OUT_ACTIVE, JSON.stringify(enriched, null, 2));
  console.log(`\n   Gespeichert: ${OUT_ACTIVE}`);

  // 3d. Report generieren
  console.log("\n=== 4. REPORT GENERIEREN ===");
  const reportLines = [
    `# GBrain Fork Analyse Report`,
    ``,
    `**Generiert:** ${new Date().toISOString()}`,
    `**Gesamt Forks:** ${allForks.length}`,
    `**Aktive Forks (seit ${CUTOFF_DATE.toISOString().slice(0,10)}):** ${enriched.length}`,
    ``,
    `## Priorisierte aktive Forks (nach Push-Datum, neueste zuerst)`,
    ``,
  ];

  for (const f of enriched) {
    reportLines.push(
      `### ${f.owner}/${f.repo}`,
      `- **URL:** ${f.html_url}`,
      `- **Stars:** ${f.stars} | **Forks:** ${f.forks} | **Open Issues:** ${f.open_issues}`,
      `- **Created:** ${f.created_at.slice(0,10)} | **Last Push:** ${f.pushed_at.slice(0,10)}`,
      `- **Commits seit Fork:** ${f.commits_total} (davon ${f.commits_meaningful} sinnvoll)`,
      `- **Description:** ${f.description || "(keine)"}`,
      `- **Größe:** ${formatBytes(f.size_kb * 1024)}`,
      ``,
      `#### Neueste Commits:`,
      ...f.commit_messages.map(
        (c: any) => `- \`${c.sha}\` (${c.date?.slice(0,10)}) ${c.message} — *${c.author}*`
      ),
      ``,
      `---`,
      ``
    );
  }

  await Bun.write(OUT_REPORT, reportLines.join("\n"));
  console.log(`   Gespeichert: ${OUT_REPORT}`);

  // 3e. Zusammenfassung
  console.log("\n=== ZUSAMMENFASSUNG ===");
  console.log(`Gesamt Forks:        ${allForks.length}`);
  console.log(`Aktive Forks:        ${activeForks.length}`);
  console.log(`Detailliert analys.: ${enriched.length}`);
  console.log(`Mit Commits > 0:     ${enriched.filter((f: any) => f.commits_meaningful > 0).length}`);
  console.log(`Mit Commits > 5:     ${enriched.filter((f: any) => f.commits_meaningful > 5).length}`);
  console.log(`\nTop-Kandidaten (meiste Commits):`);
  const top = [...enriched]
    .sort((a: any, b: any) => b.commits_meaningful - a.commits_meaningful)
    .slice(0, 10);
  for (const f of top) {
    console.log(`  ${f.owner}/${f.repo}: ${f.commits_meaningful} commits, ${f.stars} stars`);
  }
}

main().catch((err) => {
  console.error("FEHLER:", err);
  process.exit(1);
});
