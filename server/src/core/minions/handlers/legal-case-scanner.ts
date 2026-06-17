/**
 * Legal Case Scanner — Nacht-Agent-Cron Handler (v0.43).
 *
 * Scant alle legal_case Pages auf:
 *   1. Fristen < 7 Tage (critical)
 *   2. Fehlende Evidence-Dokumente
 *   3. Neue Rechtsprechung zu referenzierten Normen
 *   4. Agent-Runs, die älter als 30 Tage sind (Stale-Analyse)
 *
 * Für jede Akte, die Kriterien erfüllt, startet der Handler einen
 * Supervisor-Job mit dem Prompt:
 *   "Überprüfe Akte {slug}: Fristen, Evidence, Rechtsprechung, Risiken"
 *
 * Der Supervisor speichert sein Ergebnis automatisch als agent_run Page.
 *
 * Data interface:
 *   look_ahead_days?: number   — Default: 7 (Fristen-Window)
 *   evidence_threshold?: number — Min. Evidence pro Akte (Default: 1)
 *   max_cases?: number         — Max. Akten pro Scan (Default: 50)
 *   _source_id?: string        — Tenant-Filter
 */

import type { MinionJobContext } from '../types.ts';
import type { BrainEngine } from '../../engine.ts';
import { MinionQueue } from '../queue.ts';

export interface LegalCaseScannerData {
  look_ahead_days?: number;
  evidence_threshold?: number;
  max_cases?: number;
  _source_id?: string;
}

interface CaseToScan {
  slug: string;
  title: string;
  client_name?: string;
  court?: string;
  status?: string;
  urgent_deadlines: Array<{ title: string; due_date: string }>;
  evidence_count: number;
  last_agent_run?: string;
  reasons: string[];
}

export async function legalCaseScannerHandler(
  ctx: MinionJobContext,
  engine: BrainEngine,
): Promise<Record<string, unknown>> {
  const data = (ctx.data ?? {}) as unknown as LegalCaseScannerData;
  const lookAhead = typeof data.look_ahead_days === 'number' ? data.look_ahead_days : 7;
  const evidenceThreshold = typeof data.evidence_threshold === 'number' ? data.evidence_threshold : 1;
  const maxCases = typeof data.max_cases === 'number' ? data.max_cases : 50;
  const sourceStamp = typeof data._source_id === 'string' && data._source_id ? data._source_id : undefined;

  const queue = new MinionQueue(engine);
  const casesToScan: CaseToScan[] = [];

  // ── 1. Akten mit kritischen Fristen finden ──────────────
  const sourceClause = sourceStamp ? `AND source_id = $2` : '';
  const params: unknown[] = [lookAhead];
  if (sourceStamp) params.push(sourceStamp);

  const caseRows = await engine.executeRaw<{
    slug: string;
    title: string;
    frontmatter: unknown;
  }>(
    `SELECT slug, title, frontmatter
     FROM pages
     WHERE type = 'legal_case'
       AND deleted_at IS NULL
       ${sourceClause}
     ORDER BY updated_at DESC
     LIMIT $1`,
    [maxCases, ...(sourceStamp ? [sourceStamp] : [])],
  );

  for (const row of caseRows) {
    const fm = typeof row.frontmatter === 'string'
      ? JSON.parse(row.frontmatter) as Record<string, unknown>
      : (row.frontmatter ?? {}) as Record<string, unknown>;

    const caseSlug = row.slug;
    const reasons: string[] = [];
    const urgentDeadlines: Array<{ title: string; due_date: string }> = [];

    // Check deadlines for this case
    const deadlineRows = await engine.executeRaw<{
      title: string;
      frontmatter: unknown;
    }>(
      `SELECT title, frontmatter
       FROM pages
       WHERE type = 'legal_deadline'
         AND deleted_at IS NULL
         AND (frontmatter->>'case_slug' = $1
              OR frontmatter->>'case' = $1
              OR frontmatter->>'legal_case' = $1)
         ${sourceClause}
       ORDER BY updated_at DESC`,
      [caseSlug, ...(sourceStamp ? [sourceStamp] : [])],
    );

    for (const dRow of deadlineRows) {
      const dFm = typeof dRow.frontmatter === 'string'
        ? JSON.parse(dRow.frontmatter) as Record<string, unknown>
        : (dRow.frontmatter ?? {}) as Record<string, unknown>;
      const dueDate = String(dFm.due_date ?? '');
      const status = String(dFm.status ?? '');
      if (dueDate && status !== 'done') {
        const daysUntil = Math.ceil(
          (new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );
        if (daysUntil <= lookAhead) {
          urgentDeadlines.push({ title: dRow.title, due_date: dueDate });
          if (!reasons.includes('urgent_deadline')) {
            reasons.push('urgent_deadline');
          }
        }
      }
    }

    // Check evidence count
    const evidenceRows = await engine.executeRaw<{ cnt: string }>(
      `SELECT count(*)::text AS cnt
       FROM pages
       WHERE type = 'evidence'
         AND deleted_at IS NULL
         AND (frontmatter->>'case_slug' = $1
              OR frontmatter->>'case' = $1
              OR frontmatter->>'legal_case' = $1)
         ${sourceClause}`,
      [caseSlug, ...(sourceStamp ? [sourceStamp] : [])],
    );
    const evidenceCount = parseInt(evidenceRows[0]?.cnt ?? '0', 10);
    if (evidenceCount < evidenceThreshold) {
      reasons.push('insufficient_evidence');
    }

    // Check last agent_run
    const agentRunRows = await engine.executeRaw<{ created_at: Date }>(
      `SELECT created_at
       FROM pages
       WHERE type = 'agent_run'
         AND deleted_at IS NULL
         AND (frontmatter->>'case_slug' = $1
              OR frontmatter->>'case' = $1)
         ${sourceClause}
       ORDER BY created_at DESC
       LIMIT 1`,
      [caseSlug, ...(sourceStamp ? [sourceStamp] : [])],
    );
    let lastAgentRun: string | undefined;
    if (agentRunRows.length > 0) {
      lastAgentRun = agentRunRows[0]!.created_at.toISOString();
      const daysSince = Math.floor(
        (Date.now() - agentRunRows[0]!.created_at.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSince > 30) {
        reasons.push('stale_analysis');
      }
    } else {
      reasons.push('no_prior_analysis');
    }

    if (reasons.length > 0) {
      casesToScan.push({
        slug: caseSlug,
        title: row.title,
        client_name: String(fm.client_name ?? ''),
        court: String(fm.court ?? ''),
        status: String(fm.status ?? ''),
        urgent_deadlines: urgentDeadlines,
        evidence_count: evidenceCount,
        last_agent_run: lastAgentRun,
        reasons,
      });
    }
  }

  // ── 2. Für jede Akte Supervisor-Job starten ─────────────
  const launchedJobs: Array<{ case_slug: string; job_id: number; reasons: string[] }> = [];

  for (const caseItem of casesToScan) {
    const prompt = buildScanPrompt(caseItem);
    try {
      const job = await queue.add(
        'supervisor',
        {
          prompt,
          supervisor_model: 'claude-haiku-4-5',
          force_specialists: ['legal-researcher', 'legal-analyst'],
          skip_critic: false,
          ...(sourceStamp ? { _source_id: sourceStamp } : {}),
        } as Record<string, unknown>,
        {
          timeout_ms: 600_000, // 10 min
          max_attempts: 2,
        },
      );
      launchedJobs.push({
        case_slug: caseItem.slug,
        job_id: job.id,
        reasons: caseItem.reasons,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[legal-case-scanner] Failed to queue supervisor for ${caseItem.slug}: ${msg}`);
    }
  }

  return {
    scanned: caseRows.length,
    triggered: launchedJobs.length,
    cases: launchedJobs,
    look_ahead_days: lookAhead,
    evidence_threshold: evidenceThreshold,
  };
}

function buildScanPrompt(caseItem: CaseToScan): string {
  const lines: string[] = [];
  lines.push(`Überprüfe die Akte "${caseItem.title}" (${caseItem.slug}).`);
  lines.push('');

  if (caseItem.reasons.includes('urgent_deadline')) {
    lines.push('## Kritische Fristen');
    for (const d of caseItem.urgent_deadlines) {
      lines.push(`- ${d.title} (fällig am ${d.due_date})`);
    }
    lines.push('');
  }

  if (caseItem.reasons.includes('insufficient_evidence')) {
    lines.push(`## Beweislage (${caseItem.evidence_count} Dokumente — möglicherweise unvollständig)`);
    lines.push('Prüfe, ob wichtige Beweismittel fehlen.');
    lines.push('');
  }

  if (caseItem.reasons.includes('stale_analysis')) {
    lines.push(`## Letzte Analyse: ${caseItem.last_agent_run} (über 30 Tage alt)`);
    lines.push('Prüfe, ob sich Rechtsprechung oder Gesetzeslage geändert hat.');
    lines.push('');
  }

  if (caseItem.reasons.includes('no_prior_analysis')) {
    lines.push('## Keine vorherige Agent-Analyse vorhanden');
    lines.push('Führe eine vollständige Erst-Analyse durch.');
    lines.push('');
  }

  lines.push('## Aufgaben');
  lines.push('1. Recherchiere aktuelle Rechtsprechung zu relevanten Normen');
  lines.push('2. Prüfe Fristen-Status und dringende Handlungen');
  lines.push('3. Bewerte Evidence-Lücken');
  lines.push('4. Identifiziere Risiken und Empfehlungen');
  lines.push('5. Dokumentiere alle Erkenntnisse strukturiert');

  return lines.join('\n');
}
