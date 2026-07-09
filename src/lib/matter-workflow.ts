import type { CaseDetail } from "@/lib/matter-detail-types";
import type { MatterUnderstandingPanel } from "@/lib/matter-context-types";

export type MatterWorkflowActionKind =
  | "upload"
  | "review_documents"
  | "review_deadlines"
  | "calendar"
  | "complete_facts"
  | "strategy"
  | "work_task"
  | "complete_acceptance"
  | "verify_kyc"
  | "create_poa"
  | "send_engagement_letter";

export interface MatterWorkflowAction {
  id: string;
  kind: MatterWorkflowActionKind;
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
}

const PRIORITY_ORDER: Record<MatterWorkflowAction["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function deriveMatterWorkflowActions(
  matter: CaseDetail,
  understanding?: MatterUnderstandingPanel | null,
  calendarDeadlineIds: ReadonlySet<string> = new Set()
): MatterWorkflowAction[] {
  const actions: MatterWorkflowAction[] = [];
  const openDeadlines = matter.deadlines.filter((deadline) => deadline.status !== "done");
  const today = new Date().toISOString().slice(0, 10);

  const overdue = openDeadlines.filter((deadline) => deadline.due_date < today);
  if (overdue.length > 0) {
    actions.push({
      id: "overdue-deadlines",
      kind: "review_deadlines",
      priority: "critical",
      title: `${overdue.length} überfällige Frist${overdue.length === 1 ? "" : "en"} klären`,
      description:
        "Fristwahrung, Zustellung und gegebenenfalls Wiedereinsetzung sofort anwaltlich prüfen.",
    });
  }

  const unreviewed = openDeadlines.filter(
    (deadline) => !deadline.review_status || deadline.review_status === "unreviewed"
  );
  if (unreviewed.length > 0) {
    actions.push({
      id: "unreviewed-deadlines",
      kind: "review_deadlines",
      priority: "high",
      title: `${unreviewed.length} erkannte Frist${unreviewed.length === 1 ? "" : "en"} prüfen`,
      description:
        "KI-Ergebnisse erst nach Quellen-, Zustell- und Vier-Augen-Prüfung verbindlich übernehmen.",
    });
  }

  const reviewedWithoutCalendar = openDeadlines.filter(
    (deadline) =>
      (deadline.review_status === "reviewed" || deadline.review_status === "approved") &&
      !calendarDeadlineIds.has(deadline.id || `${deadline.title}:${deadline.due_date}`)
  );
  if (reviewedWithoutCalendar.length > 0) {
    actions.push({
      id: "calendar-deadlines",
      kind: "calendar",
      priority: "high",
      title: `${reviewedWithoutCalendar.length} geprüfte Frist${reviewedWithoutCalendar.length === 1 ? "" : "en"} in Kalender übernehmen`,
      description: "Nur fachlich geprüfte Fristen werden als Aktenkalender-Einträge angelegt.",
    });
  }

  if (matter.documents.length === 0) {
    actions.push({
      id: "upload-act",
      kind: "upload",
      priority: "high",
      title: "Akt oder Dokumente hochladen",
      description:
        "Ohne Primärquellen kann Superbrain weder Sachverhalt noch Fristen belastbar aufschlüsseln.",
    });
  } else {
    const pendingDocuments = matter.documents.filter(
      (document) =>
        document.analysis_status !== "completed" ||
        document.ocr_status === "ocr_needed" ||
        document.extraction_unverified
    );
    if (pendingDocuments.length > 0) {
      actions.push({
        id: "review-processing",
        kind: "review_documents",
        priority: "high",
        title: `${pendingDocuments.length} Dokument${pendingDocuments.length === 1 ? "" : "e"} verarbeiten oder prüfen`,
        description:
          "OCR, Klassifikation und Extraktion abschließen, bevor daraus Strategie abgeleitet wird.",
      });
    }
  }

  const importantGaps = understanding?.gaps.filter(
    (gap) => gap.severity === "critical" || gap.severity === "high"
  );
  if (importantGaps?.length) {
    actions.push({
      id: "close-understanding-gaps",
      kind: "complete_facts",
      priority: "high",
      title: `${importantGaps.length} wesentliche Wissenslücke${importantGaps.length === 1 ? "" : "n"} schließen`,
      description:
        importantGaps[0]?.recommendation || "Fehlende Tatsachen, Parteien oder Belege ergänzen.",
    });
  }

  if (!matter.strategy) {
    const posture =
      matter.defenses.length > matter.claims.length ? "Verteidigung" : "Anspruchsdurchsetzung";
    actions.push({
      id: "generate-strategy",
      kind: "strategy",
      priority: matter.documents.length > 0 ? "medium" : "low",
      title: `${posture} fundiert ausarbeiten`,
      description:
        "Rechtmäßige Optionen, Beweislast, Einwendungen, Verfahrensrisiken und nächste Schriftsätze mit Quellen prüfen.",
    });
  }

  // Mandatsannahme-Pipeline: surface missing acceptance steps as blocking actions
  const acceptance = matter.mandateAcceptance;
  if (!acceptance) {
    actions.push({
      id: "complete-acceptance",
      kind: "complete_acceptance",
      priority: "critical",
      title: "Mandatsannahme vervollständigen",
      description: "Kollisionsprüfung, KYC/GwG, Vollmacht und Mandatsbrief fehlen noch.",
    });
  } else {
    const conflict = acceptance.conflict_check;
    if (conflict.status !== "clear" && !conflict.waived) {
      actions.push({
        id: "complete-acceptance",
        kind: "complete_acceptance",
        priority: "critical",
        title: "Kollisionsprüfung offen",
        description: "§ 43a BRAO erfordert eine Kollisionsprüfung vor Mandatsannahme.",
      });
    } else if (
      acceptance.kyc.required &&
      acceptance.kyc.status !== "verified" &&
      acceptance.kyc.status !== "not_required"
    ) {
      actions.push({
        id: "verify-kyc",
        kind: "verify_kyc",
        priority: "high",
        title: "KYC / GwG verifizieren",
        description: "Identität und Risikoeinschätzung nach § 1 ff. GwG erfassen.",
      });
    } else if (
      acceptance.poa.required &&
      acceptance.poa.status !== "signed" &&
      acceptance.poa.status !== "not_required"
    ) {
      actions.push({
        id: "create-poa",
        kind: "create_poa",
        priority: "high",
        title: "Vollmacht anlegen",
        description: "Prozess- oder Generalvollmacht erfassen und ggf. unterschreiben lassen.",
      });
    } else if (
      acceptance.engagement_letter.status !== "sent" &&
      acceptance.engagement_letter.status !== "draft"
    ) {
      actions.push({
        id: "send-engagement-letter",
        kind: "send_engagement_letter",
        priority: "medium",
        title: "Mandatsbrief senden",
        description: "Mandatsannahme-Schreiben an den Mandanten versenden.",
      });
    }
  }

  const openTasks = matter.tasks.filter((task) => !task.done);
  if (openTasks.length > 0) {
    actions.push({
      id: "open-task",
      kind: "work_task",
      priority: "medium",
      title: openTasks[0].text,
      description: `${openTasks.length} offene Aufgabe${openTasks.length === 1 ? "" : "n"} in dieser Akte.`,
    });
  }

  return actions.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}
