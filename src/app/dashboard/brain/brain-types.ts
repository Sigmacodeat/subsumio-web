import {
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  CalendarClock,
  FileText,
  Inbox,
  Landmark,
  Lightbulb,
  MapPin,
  Receipt,
  Scale,
  Users,
  Workflow,
} from "lucide-react";
import type { ElementType } from "react";

/**
 * Kanzleiwissen: anwaltliche Bezeichnung je Seitentyp. Die Engine-Typen
 * (legal_case, legal_contact …) erscheinen nie roh in der Oberfläche.
 */
export const BRAIN_TYPE_LABELS: Record<string, string> = {
  legal_case: "Akte",
  legal_deadline: "Frist",
  legal_contact: "Kontakt",
  legal_actor: "Beteiligte",
  document: "Dokument",
  legal_document: "Dokument",
  invoice: "Rechnung",
  workflow: "Ablauf",
  intake_request: "Mandatsanfrage",
  agent_action: "Freigabevorgang",
  person: "Person",
  company: "Unternehmen",
  court: "Gericht",
  statute: "Gesetz",
  norm: "Norm",
  event: "Termin",
  place: "Ort",
  idea: "Notiz",
};

/** Plural for filter chips. */
export const BRAIN_TYPE_PLURALS: Record<string, string> = {
  legal_case: "Akten",
  legal_deadline: "Fristen",
  legal_contact: "Kontakte",
  legal_actor: "Beteiligte",
  document: "Dokumente",
  legal_document: "Dokumente",
  invoice: "Rechnungen",
  workflow: "Abläufe",
  intake_request: "Mandatsanfragen",
  agent_action: "Freigabevorgänge",
  person: "Personen",
  company: "Unternehmen",
  court: "Gerichte",
  statute: "Gesetze",
  norm: "Normen",
  event: "Termine",
  place: "Orte",
  idea: "Notizen",
};

export const BRAIN_TYPE_ICONS: Record<string, ElementType> = {
  legal_case: Briefcase,
  legal_deadline: CalendarClock,
  legal_contact: Users,
  legal_actor: Scale,
  document: FileText,
  legal_document: FileText,
  invoice: Receipt,
  workflow: Workflow,
  intake_request: Inbox,
  person: Users,
  company: Building2,
  court: Landmark,
  statute: BookOpen,
  norm: BookOpen,
  event: Calendar,
  place: MapPin,
  idea: Lightbulb,
};

/**
 * Interne Buchhaltungs-Seiten der Engine (Nachverarbeitungs-Aufträge,
 * Kanzlei-Konfiguration, Systemeinträge). Sie sind kein Kanzleiwissen und
 * bleiben in der Anwaltsoberfläche ausgeblendet.
 */
const INTERNAL_TYPES = new Set([
  "post_upload_task",
  "post_upload_task_done",
  "kanzlei_settings",
  "system",
  "agent_template",
]);

export function isInternalBrainType(type: string | undefined | null): boolean {
  return !!type && INTERNAL_TYPES.has(type);
}

export function brainTypeLabel(type: string | undefined | null): string {
  return (type && BRAIN_TYPE_LABELS[type]) || "Eintrag";
}

export function brainTypeIcon(type: string | undefined | null): ElementType {
  return (type && BRAIN_TYPE_ICONS[type]) || FileText;
}

/** Akten öffnen die Aktenansicht, alles andere die Detailseite im Kanzleiwissen. */
export function brainEntryHref(slug: string, type: string | undefined | null): string {
  const path = slug.split("/").map(encodeURIComponent).join("/");
  if (type === "legal_case") return `/dashboard/cases/${path}`;
  return `/dashboard/brain/${encodeURIComponent(slug)}`;
}
