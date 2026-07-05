import { NextRequest, NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import {
  fetchPendingTasks,
  markTaskRunning,
  markTaskCompleted,
  markTaskFailed,
  markTaskRequiresApproval,
  broadcastAutonomousTaskCompleted,
  type AutonomousTask,
} from "@/lib/autonomous-queue";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { triageMessage, type TriageInput } from "@/lib/triage";
import { dispatchWebhookEvent } from "@/lib/webhook-dispatch";
import { createAutonomousTaskNotification } from "@/lib/comments";
import { getStore } from "@/lib/auth/store";
import { logger } from "@/lib/logger";

const log = logger("autonomous-engine");

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Autonomous Engine — Processes autonomous tasks from the priority queue.
 *
 * Cron job runs every minute, fetches pending tasks ordered by priority,
 * and executes them. Tasks can be:
 * - deadline_followup: Send follow-up for approaching deadlines
 * - inbox_triage: Triage incoming emails
 * - document_analysis: Analyze uploaded documents
 * - workflow_start: Start a workflow autonomously
 * - email_draft: Generate email drafts
 * - client_update: Generate client updates
 * - report_generation: Generate reports
 *
 * Tasks are executed with retry logic (MAX_ATTEMPTS=4) and can require
 * human approval for critical actions.
 */
async function autonomousEngineHandler(_req: NextRequest): Promise<Response> {
  // System brain acts as aggregator for autonomous tasks across all brains.
  // Each task carries its own brain_id in the payload for scoped engine calls.
  const brainId = "system";
  const headers = engineHeadersForBrain(brainId);

  // Fetch pending tasks (up to 10 per run to avoid overwhelming the system)
  const tasks = await fetchPendingTasks(brainId, 10);

  const results: Array<{
    taskId: string;
    taskType: string;
    status: string;
    error?: string;
  }> = [];

  async function notifyBrainUsers(
    taskBrainId: string,
    taskId: string,
    taskType: string,
    status: "completed" | "failed" | "requires_approval",
    caseSlug?: string,
    result?: Record<string, unknown>
  ) {
    try {
      const store = getStore();
      const users = await store.list();
      for (const user of users) {
        if (user.deactivatedAt) continue;
        const userBrainId = user.orgId ? user.brainId : user.brainId;
        if (userBrainId !== taskBrainId && taskBrainId !== "system") continue;
        await createAutonomousTaskNotification({
          userId: user.id,
          brainId: user.brainId,
          taskId,
          taskType,
          status,
          caseSlug,
          result,
        });
      }
    } catch {
      // best-effort
    }
  }

  for (const task of tasks) {
    try {
      // Mark task as running
      await markTaskRunning(brainId, task.id);

      // Execute task based on type
      const result = await executeTask(task, headers);

      // Check if task requires approval
      if (result.requiresApproval) {
        await markTaskRequiresApproval(brainId, task.id, result.data);
        broadcastAutonomousTaskCompleted(brainId, {
          taskId: task.id,
          status: "requires_approval",
          result: result.data,
        });
        await notifyBrainUsers(
          task.brain_id,
          task.id,
          task.task_type,
          "requires_approval",
          task.case_slug,
          result.data
        );
        results.push({ taskId: task.id, taskType: task.task_type, status: "requires_approval" });
      } else {
        await markTaskCompleted(brainId, task.id, result.data);
        broadcastAutonomousTaskCompleted(brainId, {
          taskId: task.id,
          status: "completed",
          result: result.data,
        });
        await notifyBrainUsers(
          task.brain_id,
          task.id,
          task.task_type,
          "completed",
          task.case_slug,
          result.data
        );
        results.push({ taskId: task.id, taskType: task.task_type, status: "completed" });
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await markTaskFailed(brainId, task.id, error);
      await notifyBrainUsers(task.brain_id, task.id, task.task_type, "failed", task.case_slug);
      results.push({
        taskId: task.id,
        taskType: task.task_type,
        status: "failed",
        error,
      });
    }
  }

  return NextResponse.json({
    executedAt: new Date().toISOString(),
    totalProcessed: results.length,
    results,
  });
}

async function executeTask(
  task: AutonomousTask,
  headers: HeadersInit
): Promise<{
  requiresApproval: boolean;
  data?: Record<string, unknown>;
}> {
  switch (task.task_type) {
    case "deadline_followup":
      return await executeDeadlineFollowup(task, headers);
    case "inbox_triage":
      return await executeInboxTriage(task, headers);
    case "document_analysis":
      return await executeDocumentAnalysis(task, headers);
    case "workflow_start":
      return await executeWorkflowStart(task, headers);
    case "email_draft":
      return await executeEmailDraft(task, headers);
    case "client_update":
      return await executeClientUpdate(task, headers);
    case "report_generation":
      return await executeReportGeneration(task, headers);
    default:
      throw new Error(`Unknown task type: ${task.task_type}`);
  }
}

async function executeDeadlineFollowup(
  task: AutonomousTask,
  headers: HeadersInit
): Promise<{
  requiresApproval: boolean;
  data?: Record<string, unknown>;
}> {
  const { case_slug, deadline_id, urgency, recipient, deadline_date, case_title } = task.payload;

  // Fetch case details from engine for context
  let caseName = String(case_title ?? case_slug ?? "Akte");
  if (case_slug) {
    try {
      const caseRes = await fetch(
        `${ENGINE_URL}/api/pages/${encodeURIComponent(String(case_slug))}`,
        {
          headers,
          signal: AbortSignal.timeout(10_000),
        }
      );
      if (caseRes.ok) {
        const caseData = await caseRes.json();
        caseName = String(caseData.title ?? caseName);
      }
    } catch {
      // best-effort
    }
  }

  const urgencyLabel =
    urgency === "urgent" ? "DRINGEND" : urgency === "warning" ? "Warnung" : "Hinweis";
  const dueDateFormatted = deadline_date
    ? new Date(String(deadline_date)).toLocaleDateString("de-DE", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "bald";

  const subject = `[${urgencyLabel}] Frist-Erinnerung: ${caseName}`;
  const textBody = `Sehr geehrte(r) Rechtsanwalt/Anwältin,

Dies ist eine automatische Frist-Erinnerung für die Akte "${caseName}".

Frist: ${dueDateFormatted}
Dringlichkeit: ${urgencyLabel}

Bitte prüfen Sie die Akte zeitnah und ergreifen Sie die notwendigen Maßnahmen.

Mit freundlichen Grüßen
Ihr Subsumio Assistant`;

  const htmlBody = `<html><body style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
<h2 style="color: ${urgency === "urgent" ? "#dc2626" : "#d97706"};">${urgencyLabel}: Frist-Erinnerung</h2>
<p><strong>Akte:</strong> ${caseName}</p>
<p><strong>Frist:</strong> ${dueDateFormatted}</p>
<p>Bitte prüfen Sie die Akte zeitnah und ergreifen Sie die notwendigen Maßnahmen.</p>
<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
<p style="color: #6b7280; font-size: 0.875rem;">Diese E-Mail wurde automatisch von Subsumio generiert.</p>
</body></html>`;

  // Send email if configured and recipient is provided
  if (isMailConfigured() && recipient) {
    const result = await sendMail({
      to: String(recipient),
      subject,
      text: textBody,
      html: htmlBody,
    });

    if (!result.sent) {
      log.warn("Deadline follow-up email failed", { case_slug, deadline_id, error: result.error });
    }

    return {
      requiresApproval: false,
      data: {
        case_slug,
        deadline_id,
        urgency,
        recipient,
        email_sent: result.sent,
        email_id: result.id,
        message: "Follow-up email sent",
      },
    };
  }

  // No mail configured — log for audit trail
  log.info("Deadline follow-up queued (mail not configured)", { case_slug, deadline_id, urgency });
  return {
    requiresApproval: false,
    data: {
      case_slug,
      deadline_id,
      urgency,
      email_sent: false,
      message: "Follow-up queued (mail not configured)",
    },
  };
}

async function executeInboxTriage(
  task: AutonomousTask,
  headers: HeadersInit
): Promise<{
  requiresApproval: boolean;
  data?: Record<string, unknown>;
}> {
  const { message_id, subject, body, sender, source, raw_slug, case_ref } = task.payload;

  // Run triage classification using the existing triage engine
  const triageInput: TriageInput = {
    source: (source as TriageInput["source"]) ?? "email",
    subject: String(subject ?? ""),
    body: String(body ?? ""),
    sender: sender ? String(sender) : undefined,
    date: new Date().toISOString(),
    caseRef: case_ref ? String(case_ref) : undefined,
    rawSlug: raw_slug ? String(raw_slug) : undefined,
  };

  const card = triageMessage(triageInput);

  // Persist triage result to engine if we have a raw_slug
  if (raw_slug) {
    try {
      await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(String(raw_slug))}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          frontmatter: {
            triage_urgency: card.urgency,
            triage_action_type: card.actionType,
            triage_legal_area: card.legalArea,
            triage_deadline: card.deadline,
            triage_confidence: card.confidence,
            triage_status: "triaged",
            triage_suggested_case: card.suggestedCaseSlug,
            triaged_at: new Date().toISOString(),
            triaged_by: "autonomous_engine",
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // best-effort — triage result is still returned
    }
  }

  // Fire webhook for critical/high urgency triage results
  if (card.urgency === "critical" || card.urgency === "high") {
    await dispatchWebhookEvent("document.received", {
      message_id,
      subject,
      urgency: card.urgency,
      action_type: card.actionType,
      suggested_case: card.suggestedCaseSlug,
      deadline: card.deadline,
    });
  }

  return {
    requiresApproval: card.urgency === "critical",
    data: {
      message_id,
      subject,
      triage_urgency: card.urgency,
      triage_action: card.actionType,
      triage_legal_area: card.legalArea,
      triage_deadline: card.deadline,
      triage_confidence: card.confidence,
      suggested_case: card.suggestedCaseSlug,
      message: "Email triaged",
    },
  };
}

async function executeDocumentAnalysis(
  task: AutonomousTask,
  headers: HeadersInit
): Promise<{
  requiresApproval: boolean;
  data?: Record<string, unknown>;
}> {
  // Analyze document
  const { document_id, case_slug } = task.payload;

  // Trigger analysis via engine API
  const res = await fetch(`${ENGINE_URL}/api/legal/trigger-pipeline`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      doc_slug: document_id,
      case_slug,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`Analysis failed: ${res.status}`);
  }

  return {
    requiresApproval: false,
    data: {
      document_id,
      case_slug,
      message: "Document analysis triggered",
    },
  };
}

async function executeWorkflowStart(
  task: AutonomousTask,
  headers: HeadersInit
): Promise<{
  requiresApproval: boolean;
  data?: Record<string, unknown>;
}> {
  // Start workflow autonomously
  const { template_id, case_slug, prompt } = task.payload;

  // Check if workflow requires approval (critical workflows)
  const criticalTemplates = ["litigation_prep", "compliance_check"];
  const requiresApproval = criticalTemplates.includes(template_id as string);

  if (requiresApproval) {
    return {
      requiresApproval: true,
      data: {
        template_id,
        case_slug,
        prompt,
        message: "Workflow requires approval",
      },
    };
  }

  // Start workflow via API
  const res = await fetch(`${ENGINE_URL}/api/workflows`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      template_id,
      case_slug,
      prompt,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`Workflow start failed: ${res.status}`);
  }

  return {
    requiresApproval: false,
    data: {
      template_id,
      case_slug,
      message: "Workflow started",
    },
  };
}

async function executeEmailDraft(
  task: AutonomousTask,
  headers: HeadersInit
): Promise<{
  requiresApproval: boolean;
  data?: Record<string, unknown>;
}> {
  const { case_slug, recipient, subject, context } = task.payload;

  // Generate email draft via engine's memo pipeline for legally sound content
  const prompt = `Generiere einen professionellen E-Mail-Entwurf an ${recipient}.
Betreff: ${subject}
Kontext: ${context ?? ""}
Aktenzeichen: ${case_slug ?? ""}

Der Entwurf soll höflich, professionell und rechtlich präzise formuliert sein.
Verwende eine formelle Anrede und Grußformel.`;

  let draftText: string | null = null;
  let draftSlug: string | null = null;

  try {
    const draftId = `email-drafts/${case_slug ?? "general"}-${Date.now()}`;
    const res = await fetch(`${ENGINE_URL}/api/legal/memo`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        question: prompt,
        facts: String(context ?? ""),
        jurisdiction: "de",
        case_slug: case_slug ?? undefined,
        language: "de",
        depth: "standard",
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (res.ok) {
      const data = await res.json();
      draftText = String(data.text ?? data.content ?? data.answer ?? "");
      draftSlug = draftId;

      // Persist the draft as a page in the engine
      await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: draftId,
          title: `E-Mail-Entwurf: ${subject}`,
          type: "email_draft",
          content: draftText,
          frontmatter: {
            case_slug: case_slug ?? null,
            recipient: recipient ?? null,
            subject: subject ?? null,
            status: "draft",
            generated_by: "autonomous_engine",
            created_at: new Date().toISOString(),
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
    }
  } catch (err) {
    log.warn("Email draft generation failed", { case_slug, error: String(err) });
  }

  return {
    requiresApproval: true, // Email drafts always require human approval before sending
    data: {
      case_slug,
      recipient,
      subject,
      context,
      draft_slug: draftSlug,
      draft_preview: draftText?.slice(0, 500) ?? null,
      message: draftText ? "Email draft generated" : "Email draft generation failed",
    },
  };
}

async function executeClientUpdate(
  task: AutonomousTask,
  headers: HeadersInit
): Promise<{
  requiresApproval: boolean;
  data?: Record<string, unknown>;
}> {
  const { case_slug, update_type, client_name, recipient } = task.payload;

  // Fetch recent case activity from engine for context
  let caseContext = "";
  if (case_slug) {
    try {
      const activityRes = await fetch(
        `${ENGINE_URL}/api/pages?type=activity&limit=10&case_slug=${encodeURIComponent(String(case_slug))}`,
        { headers, signal: AbortSignal.timeout(10_000) }
      );
      if (activityRes.ok) {
        const activityData = await activityRes.json();
        const activities = (
          Array.isArray(activityData) ? activityData : (activityData.pages ?? [])
        ) as Array<{
          title: string;
          frontmatter: { timestamp?: string; description?: string };
        }>;
        caseContext = activities
          .map((a) => `- ${a.title}: ${a.frontmatter.description ?? ""}`)
          .join("\n");
      }
    } catch {
      // best-effort
    }
  }

  const updateTypeLabel: Record<string, string> = {
    status_change: "Status-Update",
    deadline_reminder: "Frist-Hinweis",
    document_received: "Dokument-Eingangsbestätigung",
    hearing_scheduled: "Terminankündigung",
    general: "Allgemeines Update",
  };
  const label = updateTypeLabel[String(update_type ?? "general")] ?? "Update";

  // Generate client update via engine memo API
  let updateText: string | null = null;
  let updateSlug: string | null = null;

  try {
    const slug = `client-updates/${case_slug ?? "general"}-${Date.now()}`;
    const res = await fetch(`${ENGINE_URL}/api/legal/memo`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        question: `Generiere ein professionelles Mandanten-Update (${label}) für ${client_name ?? "den Mandanten"}.
Aktenzeichen: ${case_slug ?? ""}
Letzte Aktivitäten:
${caseContext}

Das Update soll verständlich, höflich und informativ sein. Verwende eine formelle Anrede.`,
        facts: caseContext || "Keine spezifischen Aktivitäten verfügbar.",
        jurisdiction: "de",
        case_slug: case_slug ?? undefined,
        language: "de",
        depth: "brief",
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (res.ok) {
      const data = await res.json();
      updateText = String(data.text ?? data.content ?? data.answer ?? "");
      updateSlug = slug;

      // Persist the client update
      await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          title: `Mandanten-Update: ${label} — ${case_slug ?? ""}`,
          type: "client_update",
          content: updateText,
          frontmatter: {
            case_slug: case_slug ?? null,
            update_type: update_type ?? "general",
            client_name: client_name ?? null,
            recipient: recipient ?? null,
            status: "pending_approval",
            generated_by: "autonomous_engine",
            created_at: new Date().toISOString(),
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
    }
  } catch (err) {
    log.warn("Client update generation failed", { case_slug, error: String(err) });
  }

  return {
    requiresApproval: true, // Client updates always require human approval
    data: {
      case_slug,
      update_type,
      client_name,
      recipient,
      update_slug: updateSlug,
      update_preview: updateText?.slice(0, 500) ?? null,
      message: updateText ? "Client update generated" : "Client update generation failed",
    },
  };
}

async function executeReportGeneration(
  task: AutonomousTask,
  headers: HeadersInit
): Promise<{
  requiresApproval: boolean;
  data?: Record<string, unknown>;
}> {
  const { report_type, case_slug, date_range } = task.payload;

  // Fetch case data and time entries for the report
  let reportData: Record<string, unknown> = {};

  if (case_slug) {
    try {
      // Fetch time entries for the case
      const timeRes = await fetch(
        `${ENGINE_URL}/api/pages?type=time_entry&limit=500&case_slug=${encodeURIComponent(String(case_slug))}`,
        { headers, signal: AbortSignal.timeout(10_000) }
      );
      if (timeRes.ok) {
        const timeData = await timeRes.json();
        const entries = (Array.isArray(timeData) ? timeData : (timeData.pages ?? [])) as Array<{
          frontmatter: {
            minutes?: number;
            billable?: boolean;
            billed?: boolean;
            rate?: number;
            description?: string;
          };
        }>;

        const totalMinutes = entries.reduce((sum, e) => sum + (e.frontmatter.minutes ?? 0), 0);
        const billableMinutes = entries
          .filter((e) => e.frontmatter.billable && !e.frontmatter.billed)
          .reduce((sum, e) => sum + (e.frontmatter.minutes ?? 0), 0);
        const billableAmount = entries
          .filter((e) => e.frontmatter.billable && !e.frontmatter.billed)
          .reduce(
            (sum, e) => sum + ((e.frontmatter.minutes ?? 0) / 60) * (e.frontmatter.rate ?? 0),
            0
          );

        reportData = {
          total_entries: entries.length,
          total_hours: (totalMinutes / 60).toFixed(2),
          unbilled_hours: (billableMinutes / 60).toFixed(2),
          unbilled_amount: billableAmount.toFixed(2),
        };
      }

      // Fetch deadlines for the case
      const deadlineRes = await fetch(
        `${ENGINE_URL}/api/pages?type=deadline&limit=100&case_slug=${encodeURIComponent(String(case_slug))}`,
        { headers, signal: AbortSignal.timeout(10_000) }
      );
      if (deadlineRes.ok) {
        const deadlineData = await deadlineRes.json();
        const deadlines = (
          Array.isArray(deadlineData) ? deadlineData : (deadlineData.pages ?? [])
        ) as Array<{
          frontmatter: { due_date?: string; status?: string };
        }>;
        reportData = {
          ...reportData,
          total_deadlines: deadlines.length,
          open_deadlines: deadlines.filter((d) => d.frontmatter.status !== "completed").length,
          upcoming_deadlines: deadlines.filter((d) => {
            if (!d.frontmatter.due_date || d.frontmatter.status === "completed") return false;
            const due = new Date(d.frontmatter.due_date).getTime();
            return due > Date.now() && due < Date.now() + 7 * 24 * 60 * 60 * 1000;
          }).length,
        };
      }
    } catch {
      // best-effort
    }
  }

  // Generate report summary via engine summarize API
  let reportText: string | null = null;
  let reportSlug: string | null = null;

  const reportTypeLabel: Record<string, string> = {
    case_summary: "Fallzusammenfassung",
    time_report: "Zeitbericht",
    billing_report: "Abrechnungsbericht",
    deadline_report: "Fristenbericht",
    activity_report: "Aktivitätsbericht",
  };
  const label = reportTypeLabel[String(report_type ?? "case_summary")] ?? "Bericht";

  try {
    const slug = `reports/${case_slug ?? "general"}-${report_type}-${Date.now()}`;
    const res = await fetch(`${ENGINE_URL}/api/legal/summarize`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Erstelle einen ${label} für die Akte ${case_slug ?? ""}.
Zeitraum: ${date_range ?? "gesamter Zeitraum"}
Daten: ${JSON.stringify(reportData, null, 2)}`,
        type: "general",
        depth: "detailed",
        language: "de",
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (res.ok) {
      const data = await res.json();
      reportText = String(data.text ?? data.content ?? data.summary ?? "");
      reportSlug = slug;

      // Persist the report
      await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          title: `${label}: ${case_slug ?? ""}`,
          type: "report",
          content: reportText,
          frontmatter: {
            report_type: report_type ?? "case_summary",
            case_slug: case_slug ?? null,
            date_range: date_range ?? null,
            generated_by: "autonomous_engine",
            created_at: new Date().toISOString(),
            ...reportData,
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
    }
  } catch (err) {
    log.warn("Report generation failed", { case_slug, error: String(err) });
  }

  return {
    requiresApproval: false,
    data: {
      report_type,
      case_slug,
      date_range,
      report_slug: reportSlug,
      report_preview: reportText?.slice(0, 500) ?? null,
      metrics: reportData,
      message: reportText ? "Report generated" : "Report generation failed",
    },
  };
}

export const POST = createCronHandler(autonomousEngineHandler, { maxDuration: 120 });
