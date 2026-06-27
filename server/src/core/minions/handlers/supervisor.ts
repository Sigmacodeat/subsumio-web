/**
 * Supervisor handler — Hierarchische Agenten-Orchestration (v0.43).
 *
 * Dieser Handler implementiert die Supervisor → Specialist → Critic-Architektur.
 * Der Supervisor:
 *   1. Liest den User-Prompt
 *   2. Nutzt einen schnellen LLM-Call (Haiku/Sonnet) zur Task-Dekomposition
 *   3. Erzeugt Child-Jobs in Abhängigkeits-Wellen: Schritte mit `depends_on`
 *      warten auf das Ergebnis ihres Vorgängers und bekommen es in den
 *      Prompt injiziert (researcher → analyst → strategist ist damit eine
 *      echte Pipeline, kein Fan-out)
 *   4. Synthetisiert ein Gesamtergebnis (Markdown oder LLM via
 *      `aggregate_with_llm`)
 *   5. Lässt den Critic prüfen; bei "revise"/"reject" läuft EINE
 *      Überarbeitungsrunde mit dem Critic-Feedback
 *
 * Der Supervisor selbst ist ein Minion-Job, der als Parent fungiert.
 * Seine Children sind `subagent`-Jobs mit `subagent_def` gesetzt.
 *
 * Data interface:
 *   prompt: string              — die User-Anfrage
 *   supervisor_model?: string   — Modell für die Dekomposition (default: Haiku)
 *   force_specialists?: string[] — Override: nutze diese Specialists statt Auto-Plan
 *   skip_critic?: boolean        — Keine Critic-Phase nach den Specialists
 *   aggregate_with_llm?: boolean — Nutze LLM statt Markdown-Zusammenfassung
 *   _source_id?: string          — Tenant-Stempel (web-api); wird an alle
 *                                  Children propagiert, damit die Agent-API
 *                                  source-scoped bleibt
 */

import type { MinionJobContext } from "../types.ts";
import type { BrainEngine } from "../../engine.ts";
import { MinionQueue } from "../queue.ts";
import { resolveSpecialist } from "../specialist-defs.ts";
import { parseMarkdown } from "../../markdown.ts";
import { inheritBudgetOwner } from "../budget-tracker.ts";

export interface SupervisorHandlerData {
  prompt: string;
  supervisor_model?: string;
  force_specialists?: string[];
  skip_critic?: boolean;
  aggregate_with_llm?: boolean;
  _source_id?: string;
}

export interface SupervisorPlan {
  /** Der dekomponierte Plan: welche Specialists in welcher Reihenfolge */
  steps: SupervisorStep[];
  /** Begründung des Supervisors */
  reasoning: string;
}

export interface SupervisorStep {
  /** Specialist-Name (z. B. 'legal-researcher') */
  specialist: string;
  /** Spezifischer Prompt für diesen Schritt */
  prompt: string;
  /** 0-basierter Index eines VORHERIGEN Schritts, dessen Ergebnis dieser Schritt braucht */
  depends_on?: number;
}

export interface SupervisorChildResult {
  child_id: number;
  specialist: string;
  outcome: string;
  result: unknown;
  error: string | null;
}

export interface SupervisorResult {
  plan: SupervisorPlan;
  children: SupervisorChildResult[];
  synthesis: string;
  critic_review?: string;
  /** Gesetzt, wenn der Critic "revise"/"reject" empfahl und eine Überarbeitungsrunde lief. */
  revised_synthesis?: string;
}

// ── Dekompositions-Prompt ───────────────────────────────────

const DECOMPOSITION_SYSTEM = `Du bist ein Task-Supervisor für ein Legal-AI-System. Deine Aufgabe ist es, eingehende Anfragen in kleine, spezialisierte Teilaufgaben zu zerlegen.

Verfügbare Specialist-Rollen:
- legal-researcher: Recherche zu Rechtsfragen mit exakten Zitaten
- legal-analyst: Bewertung von Fällen, Chancen/Risiko-Analyse
- legal-strategist: Prozessstrategie, Settlement-Empfehlungen
- legal-drafter: Formulierung von Schriftsätzen, Anträgen, Verträgen
- legal-deadline-extractor: Extraktion von Fristen und Terminen aus Dokumenten

Regeln:
- Zerlege die Aufgabe in 1–4 Schritte.
- Jeder Schritt bekommt EINEN Specialist und einen spezifischen Prompt.
- Wenn ein Schritt das ERGEBNIS eines früheren Schritts braucht, setze "depends_on" auf den 0-basierten Index dieses Schritts. Das Ergebnis wird dem abhängigen Schritt automatisch als Kontext mitgegeben.
- Wenn die Aufgabe rein recherchierend ist: nur legal-researcher.
- Wenn ein Fall bewertet werden soll: researcher → analyst (depends_on: 0) → strategist (depends_on: 1).
- Wenn ein Schriftsatz entworfen werden soll: researcher → drafter (depends_on: 0).
- Unabhängige Schritte (ohne depends_on) laufen parallel.
- Jeder Prompt muss konkret sein — kein "recherchiere", sondern "recherchiere zu § 823 BGB im Kontext von X".
- Wenn dem Prompt ein "## Akten-Kontext" vorangestellt ist, nutze diese Informationen für die Zerlegung. Berücksichtige Fristen und Evidence bei der Specialist-Auswahl.

Antworte NUR im folgenden JSON-Format:
{
  "reasoning": "Begründung der Zerlegung...",
  "steps": [
    { "specialist": "legal-researcher", "prompt": "..." },
    { "specialist": "legal-analyst", "prompt": "...", "depends_on": 0 }
  ]
}`;

// ── Handler ─────────────────────────────────────────────────

export function makeSupervisorHandler(opts: { engine: BrainEngine }) {
  const engine = opts.engine;

  return async function supervisorHandler(ctx: MinionJobContext): Promise<SupervisorResult> {
    const data = (ctx.data ?? {}) as unknown as SupervisorHandlerData;
    if (!data.prompt || typeof data.prompt !== "string") {
      throw new Error("supervisor job data.prompt is required (string)");
    }

    const queue = new MinionQueue(engine);
    const sourceStamp =
      typeof data._source_id === "string" && data._source_id ? data._source_id : undefined;

    // ── v0.43: Case Context Auto-Load ───────────────────────
    let caseContext: CaseContext | null = null;
    try {
      caseContext = await loadCaseContext(engine, data.prompt, sourceStamp);
    } catch {
      // Non-fatal: proceed with plain prompt if context loading fails
    }

    // ── Schritt 1: Plan erzeugen ────────────────────────────
    let plan: SupervisorPlan;
    const enrichedPrompt = caseContext
      ? `${data.prompt}\n\n## Akten-Kontext (automatisch geladen)\n\n${formatCaseContext(caseContext)}`
      : data.prompt;
    if (data.force_specialists && data.force_specialists.length > 0) {
      // Operator hat Specialists explizit vorgegeben — sequentielle Kette,
      // jeder Schritt sieht das Ergebnis des vorherigen.
      plan = {
        reasoning: "Operator-specified specialist sequence",
        steps: data.force_specialists.map((name, idx) => ({
          specialist: name,
          prompt: enrichedPrompt,
          ...(idx > 0 ? { depends_on: idx - 1 } : {}),
        })),
      };
    } else {
      // Auto-Dekomposition via LLM
      plan = await decomposeTask(enrichedPrompt, data.supervisor_model);
    }

    // Unbekannte Specialists früh ablehnen — vor dem ersten Child-Submit.
    for (const step of plan.steps) {
      if (!resolveSpecialist(step.specialist)) {
        throw new Error(`supervisor: unknown specialist "${step.specialist}"`);
      }
    }

    const totalSteps = plan.steps.length + 2;
    await ctx.updateProgress({
      step: 1,
      total: totalSteps,
      message: "Plan created — launching specialists",
    });

    // ── Schritt 2+3: Wellen ausführen ───────────────────────
    // buildExecutionWaves gruppiert Schritte so, dass jeder Schritt erst
    // läuft, wenn sein depends_on-Vorgänger fertig ist. Schritte ohne
    // Abhängigkeit laufen parallel in Welle 0.
    const waves = buildExecutionWaves(plan.steps);
    const collector = new InboxCollector(ctx);
    const stepResults = new Map<number, SupervisorChildResult>();
    const childIdToStep = new Map<number, number>();
    let launched = 0;

    for (const wave of waves) {
      const waveChildIds: number[] = [];
      for (const stepIdx of wave) {
        const step = plan.steps[stepIdx]!;
        const def = resolveSpecialist(step.specialist)!;

        const prompt = withDependencyContext(step, plan.steps, stepResults);
        const childData: Record<string, unknown> = {
          prompt,
          subagent_def: step.specialist,
          max_turns: def.maxTurns ?? 20,
        };
        if (def.model) childData.model = def.model;
        if (sourceStamp) childData._source_id = sourceStamp;

        const child = await queue.add(
          "subagent",
          childData,
          {
            parent_job_id: ctx.id,
            on_child_fail: "continue", // mixed outcomes allowed
            max_stalled: 3,
          },
          { allowProtectedSubmit: true }
        );
        // Propagate budget ownership from supervisor to child so
        // reserveBudget() in the subagent turn loop can deduct from
        // the owner's budget_remaining_cents. Without this, children
        // have budget_owner_job_id = NULL and bypass the cap silently.
        await inheritBudgetOwner(engine, child.id, ctx.id);
        waveChildIds.push(child.id);
        childIdToStep.set(child.id, stepIdx);
        launched++;
      }

      await ctx.updateProgress({
        step: 1 + launched,
        total: totalSteps,
        message: `Wave running: ${wave.map((i) => plan.steps[i]!.specialist).join(", ")}`,
      });

      const waveResults = await collector.waitFor(waveChildIds, 30 * 60 * 1000);
      for (const childId of waveChildIds) {
        const stepIdx = childIdToStep.get(childId)!;
        const specialist = plan.steps[stepIdx]!.specialist;
        const found = waveResults.get(childId);
        stepResults.set(
          stepIdx,
          found
            ? { ...found, specialist }
            : {
                child_id: childId,
                specialist,
                outcome: "failed",
                result: null,
                error: "Timed out waiting for child completion",
              }
        );
      }
    }

    const children: SupervisorChildResult[] = plan.steps.map(
      (step, idx) =>
        stepResults.get(idx) ?? {
          child_id: -1,
          specialist: step.specialist,
          outcome: "failed",
          result: null,
          error: "Step was never launched",
        }
    );

    await ctx.updateProgress({
      step: totalSteps - 1,
      total: totalSteps,
      message: "All specialists complete — synthesizing",
    });

    // ── Schritt 4: Synthese ─────────────────────────────────
    let synthesis: string;
    if (data.aggregate_with_llm) {
      synthesis = await synthesizeWithLlm(data.prompt, children, plan, data.supervisor_model).catch(
        () => synthesizeResults(children, plan)
      );
    } else {
      synthesis = synthesizeResults(children, plan);
    }

    // ── Schritt 5: Optionaler Critic + Revise-Runde ─────────
    let criticReview: string | undefined;
    let revisedSynthesis: string | undefined;
    if (!data.skip_critic) {
      const criticMsg = await runChild(queue, collector, ctx, {
        prompt: `Review the following legal analysis for accuracy, completeness, and citation quality.\n\n${synthesis}`,
        subagent_def: "legal-critic",
        max_turns: 20,
        ...(sourceStamp ? { _source_id: sourceStamp } : {}),
      });

      if (criticMsg && criticMsg.outcome === "complete") {
        criticReview =
          typeof criticMsg.result === "string"
            ? criticMsg.result
            : JSON.stringify(criticMsg.result);

        // Eine Überarbeitungsrunde, wenn der Critic revise/reject empfiehlt.
        // Die Revision macht der letzte Specialist des Plans (er kennt die
        // Aufgabenstellung des finalen Outputs am besten).
        if (criticRecommendsRevision(criticReview)) {
          const reviser = plan.steps[plan.steps.length - 1]?.specialist ?? "legal-researcher";
          const reviseMsg = await runChild(queue, collector, ctx, {
            prompt: [
              "Überarbeite die folgende Analyse anhand des Critic-Feedbacks.",
              "Behebe jeden genannten Mangel. Behalte korrekte Teile bei.",
              "",
              "## Ursprüngliche Analyse",
              synthesis,
              "",
              "## Critic-Feedback",
              criticReview,
            ].join("\n"),
            subagent_def: reviser,
            max_turns: 20,
            ...(sourceStamp ? { _source_id: sourceStamp } : {}),
          });
          if (reviseMsg && reviseMsg.outcome === "complete" && reviseMsg.result != null) {
            revisedSynthesis =
              typeof reviseMsg.result === "string"
                ? reviseMsg.result
                : JSON.stringify(reviseMsg.result);
          }
        }
      }
    }

    await ctx.updateProgress({ step: totalSteps, total: totalSteps, message: "Done" });

    // ── v0.43: Persistiere das Ergebnis als Brain-Page ───────────
    // Damit landet die Agent-Analyse im normalen Brain-Zyklus:
    // sync → extract → embed → patterns. Sie wird durchsuchbar,
    // verknüpft und bleibt persistent.
    const resultSlug = `agent-runs/supervisor-${ctx.id}-${Date.now()}`;
    const resultMd = buildAgentRunMarkdown({
      prompt: data.prompt,
      jobId: ctx.id,
      caseContext,
      plan,
      children,
      synthesis,
      criticReview,
      revisedSynthesis,
      model: data.supervisor_model,
    });
    try {
      const parsed = parseMarkdown(resultMd);
      await engine.putPage(
        resultSlug,
        {
          type: "agent_run",
          title: parsed.title ?? `Agent-Analyse #${ctx.id}`,
          compiled_truth: parsed.compiled_truth ?? resultMd,
          frontmatter: {
            ...(parsed.frontmatter ?? {}),
            agent_job_id: ctx.id,
            agent_type: "supervisor",
            ...(caseContext ? { case_slug: caseContext.slug } : {}),
            ...(data.supervisor_model ? { model: data.supervisor_model } : {}),
          },
        },
        { sourceId: sourceStamp }
      );
    } catch (e) {
      // Non-fatal: the job result is still returned; the page write
      // is best-effort so we don't fail a successful analysis.
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[supervisor] put_page failed for agent run ${ctx.id}: ${msg}`);
    }

    return {
      plan,
      children,
      synthesis,
      ...(criticReview ? { critic_review: criticReview } : {}),
      ...(revisedSynthesis ? { revised_synthesis: revisedSynthesis } : {}),
    };
  };
}

// ── Agent-Run Markdown Builder ────────────────────────────

interface AgentRunMarkdownOpts {
  prompt: string;
  jobId: number;
  caseContext: CaseContext | null;
  plan: SupervisorPlan;
  children: SupervisorChildResult[];
  synthesis: string;
  criticReview?: string;
  revisedSynthesis?: string;
  model?: string;
}

function buildAgentRunMarkdown(opts: AgentRunMarkdownOpts): string {
  const {
    prompt,
    jobId,
    caseContext,
    plan,
    children,
    synthesis,
    criticReview,
    revisedSynthesis,
    model,
  } = opts;
  const dateIso = new Date().toISOString();
  const lines: string[] = [];

  lines.push("---");
  lines.push(`title: "Agent-Analyse #${jobId}${caseContext ? ` — ${caseContext.title}` : ""}"`);
  lines.push(`type: agent_run`);
  lines.push(`agent_job_id: ${jobId}`);
  lines.push(`agent_type: supervisor`);
  lines.push(`date: ${dateIso}`);
  if (model) lines.push(`model: ${model}`);
  if (caseContext) lines.push(`case_slug: ${caseContext.slug}`);
  lines.push("---");
  lines.push("");

  lines.push("## Aufgabe");
  lines.push(prompt);
  lines.push("");

  if (caseContext) {
    lines.push("## Akten-Kontext");
    lines.push(`Akte: [${caseContext.title}](${caseContext.slug})`);
    if (caseContext.deadlines.length > 0) {
      lines.push("");
      lines.push("### Fristen");
      for (const d of caseContext.deadlines) {
        lines.push(`- ${d.title}${d.due_date ? ` (bis ${d.due_date})` : ""}`);
      }
    }
    if (caseContext.evidence.length > 0) {
      lines.push("");
      lines.push("### Beweismittel");
      for (const e of caseContext.evidence) {
        lines.push(`- ${e.title}${e.type ? ` (${e.type})` : ""}`);
      }
    }
    lines.push("");
  }

  lines.push("## Plan");
  lines.push(plan.reasoning);
  lines.push("");
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]!;
    lines.push(
      `${i + 1}. **${step.specialist}**${step.depends_on != null ? ` (hängt ab von Schritt ${step.depends_on + 1})` : ""}`
    );
    lines.push(`   > ${step.prompt.slice(0, 200)}${step.prompt.length > 200 ? "…" : ""}`);
  }
  lines.push("");

  lines.push("## Ergebnis");
  lines.push(synthesis);
  lines.push("");

  if (revisedSynthesis) {
    lines.push("## Überarbeitetes Ergebnis (nach Critic)");
    lines.push(revisedSynthesis);
    lines.push("");
  }

  if (criticReview) {
    lines.push("## Critic-Review");
    lines.push(criticReview);
    lines.push("");
  }

  lines.push("## Specialist-Ergebnisse");
  for (const child of children) {
    const status = child.outcome === "complete" ? "✅" : child.outcome === "failed" ? "❌" : "⏳";
    lines.push(`### ${status} ${child.specialist} (#${child.child_id})`);
    if (child.result) {
      const text =
        typeof child.result === "string" ? child.result : JSON.stringify(child.result, null, 2);
      lines.push(text.slice(0, 500));
      if (text.length > 500) lines.push("…");
    }
    if (child.error) {
      lines.push(`**Fehler:** ${child.error}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(`*Generiert von Subsumio Supervisor am ${new Date().toLocaleString("de-DE")}*`);

  return lines.join("\n");
}

// ── Wellen-Planung (pur, testbar) ───────────────────────────

/**
 * Gruppiert Plan-Schritte in Ausführungs-Wellen. Ein Schritt mit gültigem
 * `depends_on` (Index eines FRÜHEREN Schritts) landet eine Welle nach seinem
 * Vorgänger. Ungültige Referenzen (self/forward/out-of-range) werden ignoriert
 * → Welle 0. Schritte ohne Abhängigkeit laufen parallel in Welle 0.
 */
export function buildExecutionWaves(steps: ReadonlyArray<SupervisorStep>): number[][] {
  const waves: number[][] = [];
  const waveOf = new Map<number, number>();
  for (let i = 0; i < steps.length; i++) {
    const dep = steps[i]!.depends_on;
    const validDep =
      typeof dep === "number" && Number.isInteger(dep) && dep >= 0 && dep < i ? dep : undefined;
    const wave = validDep === undefined ? 0 : waveOf.get(validDep)! + 1;
    waveOf.set(i, wave);
    (waves[wave] ??= []).push(i);
  }
  return waves;
}

/**
 * Baut den effektiven Prompt eines Schritts: hängt das Ergebnis des
 * depends_on-Vorgängers als Kontext-Sektion an (sofern vorhanden).
 */
export function withDependencyContext(
  step: SupervisorStep,
  steps: ReadonlyArray<SupervisorStep>,
  results: ReadonlyMap<number, SupervisorChildResult>
): string {
  const dep = step.depends_on;
  if (typeof dep !== "number") return step.prompt;
  const depResult = results.get(dep);
  if (!depResult || depResult.outcome !== "complete" || depResult.result == null) {
    return step.prompt;
  }
  const resultText =
    typeof depResult.result === "string"
      ? depResult.result
      : JSON.stringify(depResult.result, null, 2);
  const specialist = steps[dep]?.specialist ?? "specialist";
  return `${step.prompt}\n\n## Kontext: Ergebnis aus Schritt ${dep + 1} (${specialist})\n\n${resultText}`;
}

/** Erkennen, ob ein Critic-Review eine Überarbeitung empfiehlt. */
export function criticRecommendsRevision(review: string): boolean {
  // Der Critic ist instruiert, eine Empfehlung "publish" | "revise" | "reject"
  // auszugeben. Wir matchen tolerant (JSON-Feld ODER Fließtext), aber nur als
  // ganzes Wort, damit "revised" o. ä. nicht falsch triggert.
  return /\b(revise|reject)\b/i.test(review);
}

// ── Case Context Loader ─────────────────────────────────────

interface CaseContext {
  slug: string;
  title: string;
  content: string;
  deadlines: Array<{ title: string; due_date?: string; status?: string }>;
  evidence: Array<{ title: string; type?: string }>;
}

async function loadCaseContext(
  engine: BrainEngine,
  prompt: string,
  sourceId?: string
): Promise<CaseContext | null> {
  // Extract meaningful search terms from the prompt
  const stopWords = new Set([
    "analyse",
    "recherchiere",
    "prüfe",
    "die",
    "der",
    "das",
    "ein",
    "eine",
    "und",
    "oder",
    "mit",
    "für",
    "zur",
    "zum",
    "von",
    "zu",
    "im",
    "in",
    "den",
    "dem",
    "des",
    "nach",
    "bei",
    "aus",
    "wie",
    "was",
    "wenn",
    "dass",
    "sich",
    "hat",
    "ist",
    "sind",
    "wurde",
    "werden",
    "kann",
    "soll",
    "muss",
    "was",
    "sind",
    "wird",
    "wurden",
    "hatte",
    "hatten",
    "diese",
    "dieser",
    "dieses",
    "alle",
    "auch",
    "nur",
    "noch",
    "schon",
    "bereits",
    "jetzt",
    "dann",
    "wenn",
    "als",
    "also",
    "somit",
    "daher",
  ]);
  const searchTerms = prompt
    .toLowerCase()
    .replace(/[^\w\säöüß\-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w))
    .slice(0, 5);

  if (searchTerms.length === 0) return null;

  const pattern = `%${searchTerms.join("%")}%`;
  const sourceClause = sourceId ? `AND source_id = $2` : "";
  const params: unknown[] = sourceId ? [pattern, sourceId] : [pattern];

  const [caseRow] = await engine.executeRaw<{
    slug: string;
    title: string;
    content: string;
    frontmatter: unknown;
  }>(
    `SELECT slug, title, content, frontmatter
     FROM pages
     WHERE type = 'legal_case'
       AND deleted_at IS NULL
       AND (title ILIKE $1 OR slug ILIKE $1 OR frontmatter->>'client_name' ILIKE $1)
       ${sourceClause}
     ORDER BY updated_at DESC
     LIMIT 1`,
    params
  );

  if (!caseRow) return null;

  const fm =
    typeof caseRow.frontmatter === "string"
      ? (JSON.parse(caseRow.frontmatter) as Record<string, unknown>)
      : ((caseRow.frontmatter as Record<string, unknown>) ?? {});

  // Load related pages (deadlines, evidence, etc.)
  const sourceClause2 = sourceId ? `AND source_id = $2` : "";
  const params2: unknown[] = [caseRow.slug];
  if (sourceId) params2.push(sourceId);

  const related = await engine.executeRaw<{
    title: string;
    type: string;
    frontmatter: unknown;
  }>(
    `SELECT title, type, frontmatter
     FROM pages
     WHERE deleted_at IS NULL
       AND (
         frontmatter->>'case_slug' = $1
         OR frontmatter->>'case' = $1
         OR frontmatter->>'legal_case' = $1
         OR title ILIKE '%' || $1 || '%'
       )
       ${sourceClause2}
     ORDER BY type, updated_at DESC`,
    params2
  );

  const deadlines = related
    .filter((r) => r.type === "legal_deadline")
    .map((r) => {
      const rFm =
        typeof r.frontmatter === "string"
          ? (JSON.parse(r.frontmatter) as Record<string, unknown>)
          : ((r.frontmatter ?? {}) as Record<string, unknown>);
      return {
        title: r.title,
        due_date: String(rFm.due_date ?? ""),
        status: String(rFm.status ?? ""),
      };
    });

  const evidence = related
    .filter((r) => r.type === "evidence" || r.type === "document" || r.type === "page")
    .map((r) => {
      const rFm =
        typeof r.frontmatter === "string"
          ? (JSON.parse(r.frontmatter) as Record<string, unknown>)
          : ((r.frontmatter ?? {}) as Record<string, unknown>);
      return {
        title: r.title,
        type: String(rFm.doc_type ?? rFm.type ?? r.type),
      };
    });

  return {
    slug: caseRow.slug,
    title: caseRow.title,
    content: caseRow.content.slice(0, 4000),
    deadlines,
    evidence,
  };
}

function formatCaseContext(ctx: CaseContext): string {
  const lines: string[] = [];
  lines.push(`Akte: ${ctx.title} (${ctx.slug})`);
  lines.push("");
  if (ctx.content) {
    lines.push("## Akteninhalt (Auszug)");
    lines.push(ctx.content);
    lines.push("");
  }
  if (ctx.deadlines.length > 0) {
    lines.push("## Fristen");
    for (const d of ctx.deadlines) {
      lines.push(
        `- ${d.title}${d.due_date ? ` (bis ${d.due_date})` : ""}${d.status ? ` [${d.status}]` : ""}`
      );
    }
    lines.push("");
  }
  if (ctx.evidence.length > 0) {
    lines.push("## Beweismittel / Dokumente");
    for (const e of ctx.evidence) {
      lines.push(`- ${e.title}${e.type ? ` (${e.type})` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ── Dekomposition ───────────────────────────────────────────

async function decomposeTask(prompt: string, model?: string): Promise<SupervisorPlan> {
  // Wir nutzen die Gateway-API für einen schnellen, kostengünstigen Call
  const { chat } = await import("../../ai/gateway.ts");

  const resolvedModel = model ?? "claude-haiku-4-5"; // Kostengünstig für Dekomposition

  const result = await chat({
    model: resolvedModel,
    system: DECOMPOSITION_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const text = extractTextFromResult(result);
  return parsePlanJson(text);
}

export function extractTextFromResult(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const r = result as { text?: string; content?: string; message?: { content?: string } };
  return r.text ?? r.content ?? r.message?.content ?? JSON.stringify(result);
}

export function parsePlanJson(text: string): SupervisorPlan {
  // Versuche JSON zu extrahieren (manchmal umgeben von Markdown-Code-Block)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = jsonMatch ? jsonMatch[1]!.trim() : text.trim();

  try {
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed.steps) && parsed.steps.every(isValidStep)) {
      return {
        reasoning: String(parsed.reasoning ?? "No reasoning provided"),
        steps: parsed.steps.map((s: unknown) => {
          const o = s as Record<string, unknown>;
          return {
            specialist: String(o.specialist),
            prompt: String(o.prompt),
            ...(typeof o.depends_on === "number" && Number.isInteger(o.depends_on)
              ? { depends_on: o.depends_on }
              : {}),
          };
        }),
      };
    }
  } catch {
    // JSON-Parse fehlgeschlagen — Fallback
  }

  // Fallback: Einzel-Schritt mit researcher
  return {
    reasoning: "Auto-decomposition failed — falling back to single legal-researcher step",
    steps: [{ specialist: "legal-researcher", prompt: text }],
  };
}

function isValidStep(s: unknown): boolean {
  if (!s || typeof s !== "object") return false;
  const o = s as Record<string, unknown>;
  return typeof o.specialist === "string" && typeof o.prompt === "string";
}

// ── Inbox-Sammler ───────────────────────────────────────────
//
// readInbox() ist KONSUMIEREND (markiert read_at) — eine Message, die für
// eine spätere Welle bestimmt ist, darf nicht verloren gehen. Der Collector
// liest deshalb zentral und puffert alle child_done-Payloads, egal in
// welcher waitFor-Runde sie eintreffen.

class InboxCollector {
  private buffer = new Map<number, SupervisorChildResult>();

  constructor(private ctx: MinionJobContext) {}

  async waitFor(
    childIds: number[],
    maxWaitMs: number,
    pollIntervalMs = 2000
  ): Promise<Map<number, SupervisorChildResult>> {
    const deadline = Date.now() + maxWaitMs;
    const wanted = new Set(childIds);

    while (Date.now() < deadline) {
      if (childIds.every((id) => this.buffer.has(id))) break;
      await this.drainInbox();
      if (childIds.every((id) => this.buffer.has(id))) break;
      await sleep(pollIntervalMs);
    }

    const out = new Map<number, SupervisorChildResult>();
    for (const id of wanted) {
      const hit = this.buffer.get(id);
      if (hit) out.set(id, hit);
    }
    return out;
  }

  private async drainInbox(): Promise<void> {
    const messages = await this.ctx.readInbox();
    for (const m of messages) {
      const payload = parseChildDone(m.payload);
      if (!payload) continue;
      this.buffer.set(payload.child_id, {
        child_id: payload.child_id,
        specialist: "", // wird vom Aufrufer über die Step-Zuordnung gesetzt
        outcome: payload.outcome ?? "failed",
        result: payload.outcome === "complete" ? payload.result : null,
        error: payload.error ?? null,
      });
    }
  }
}

/** Submit ein einzelnes Child und warte auf sein Ergebnis (20 min). */
async function runChild(
  queue: MinionQueue,
  collector: InboxCollector,
  ctx: MinionJobContext,
  childData: Record<string, unknown>
): Promise<SupervisorChildResult | null> {
  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: "continue",
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );
  const results = await collector.waitFor([child.id], 20 * 60 * 1000);
  return results.get(child.id) ?? null;
}

// ── Synthese ────────────────────────────────────────────────

function synthesizeResults(children: SupervisorChildResult[], plan: SupervisorPlan): string {
  const lines: string[] = [
    "# Supervisor-Synthese",
    "",
    `**Plan:** ${plan.reasoning}`,
    "",
    "## Ergebnisse der Specialists",
    "",
  ];

  for (const child of children) {
    lines.push(`### ${child.specialist} (Job ${child.child_id})`);
    lines.push(`**Status:** ${child.outcome}`);
    if (child.error) {
      lines.push(`**Fehler:** ${child.error}`);
    }
    if (child.result) {
      const resultText =
        typeof child.result === "string" ? child.result : JSON.stringify(child.result, null, 2);
      lines.push("");
      lines.push(resultText);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function synthesizeWithLlm(
  userPrompt: string,
  children: SupervisorChildResult[],
  plan: SupervisorPlan,
  model?: string
): Promise<string> {
  const { chat } = await import("../../ai/gateway.ts");
  const raw = synthesizeResults(children, plan);

  const result = await chat({
    model: model ?? "claude-haiku-4-5",
    system: [
      "Du bist der Synthese-Schritt eines Legal-AI-Supervisors.",
      "Du bekommst die Roh-Ergebnisse mehrerer Specialist-Agenten und die ursprüngliche Anfrage.",
      "Verfasse EINE kohärente, strukturierte Antwort auf die Anfrage.",
      "Übernimm Zitate (§§, Urteile, Quellen) exakt — erfinde nichts dazu.",
      "Benenne Widersprüche zwischen den Specialists explizit, statt sie zu glätten.",
      'Ende mit: "Diese Zusammenfassung ersetzt keine anwaltliche Prüfung."',
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: `## Ursprüngliche Anfrage\n\n${userPrompt}\n\n## Specialist-Ergebnisse\n\n${raw}`,
      },
    ],
  });

  const text = extractTextFromResult(result).trim();
  if (!text) throw new Error("empty LLM synthesis");
  return text;
}

function parseChildDone(payload: unknown): {
  child_id: number;
  outcome: string;
  result: unknown;
  error: string | null;
  job_name: string;
} | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.child_id !== "number") return null;
  return {
    child_id: p.child_id,
    outcome: String(p.outcome ?? ""),
    result: p.result ?? null,
    error: p.error != null ? String(p.error) : null,
    job_name: String(p.job_name ?? ""),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
