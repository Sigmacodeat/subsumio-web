import type { BrainPage } from "@/lib/types";
import { caseFrontmatter, type DocumentEntry } from "@/lib/legal-types";
import type { DocumentRequestFrontmatter } from "@/lib/document-requests";
import type { Questionnaire } from "@/lib/questionnaires";

/**
 * What the tokenised client portal is allowed to see of a matter.
 *
 * The portal used to receive the raw case page — every frontmatter field
 * (time entries, expenses, notes, strategy, second-check trail) and every
 * document. This view whitelists the client-facing fields and only lists
 * documents explicitly released with `portal_visible: true`.
 */

export interface PortalDocument {
  name: string;
  url?: string;
  slug?: string;
  uploadedAt?: string;
  kind?: string;
  doc_type_label?: string;
}

export interface PortalDeadline {
  title: string;
  due_date: string;
  status?: string;
}

/** WP-7.41: kuratierter Regulatory-Alert, den die Kanzlei für den
 *  Mandanten veröffentlicht hat (mit anwaltlicher Einordnung). */
export interface PortalClientAlert {
  id: string;
  title: string;
  summary?: string;
  url?: string;
  date?: string;
  severity?: string;
  impact_note: string;
  published_at?: string;
}

export interface PortalCaseView {
  slug: string;
  title: string;
  /** The released `portal_summary`, or "" — never the internal case body. */
  content: string;
  frontmatter: {
    case_number?: string;
    status?: string;
    legal_area?: string;
    client_name?: string;
    opponent_name?: string;
    court_name?: string;
    claims: string[];
    portal_enabled: boolean;
    deadlines: PortalDeadline[];
    documents: PortalDocument[];
    client_alerts: PortalClientAlert[];
  };
}

export function isPortalVisibleDocument(doc: Partial<DocumentEntry> | null | undefined): boolean {
  return !!doc && doc.portal_visible === true && doc.privileged !== true;
}

export function portalVisibleDocumentSlugs(documents: DocumentEntry[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const doc of documents ?? []) {
    if (!isPortalVisibleDocument(doc)) continue;
    if (doc.slug) out.add(doc.slug);
    if (doc.url) out.add(doc.url);
  }
  return out;
}

/**
 * The only matter summary the client may see: the text the firm released as
 * `portal_summary`. The case body (`page.content`) holds internal notes and
 * strategy and is never a fallback. Shared by the portal view and the portal
 * assistant so both use the same released text.
 */
export function portalReleasedSummary(frontmatter: unknown): string {
  if (!frontmatter || typeof frontmatter !== "object") return "";
  const v = (frontmatter as Record<string, unknown>).portal_summary;
  return typeof v === "string" ? v.trim() : "";
}

/** Deadlines the client may see: reviewed/approved or manually entered, never
 *  unreviewed or rejected AI suggestions, internal pre-deadlines or done ones. */
function isPortalVisibleDeadline(d: {
  due_date?: unknown;
  status?: unknown;
  review_status?: unknown;
}): boolean {
  if (typeof d.due_date !== "string" || !d.due_date) return false;
  if (d.review_status === "unreviewed" || d.review_status === "rejected") return false;
  if (d.status === "vorfrist" || d.status === "done") return false;
  return true;
}

export function buildPortalCaseView(page: BrainPage): PortalCaseView {
  const fm = caseFrontmatter(page);
  const documents = ((fm.documents ?? []) as DocumentEntry[])
    .filter(isPortalVisibleDocument)
    .map((d) => ({
      name: d.name,
      url: d.url,
      slug: d.slug,
      uploadedAt: d.uploadedAt,
      kind: d.kind,
      doc_type_label: d.doc_type_label,
    }));
  const deadlines = (fm.deadlines ?? [])
    .filter(isPortalVisibleDeadline)
    .map((d) => ({
      title: d.title || d.description || "Frist",
      due_date: d.due_date,
      status: d.status,
    }))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return {
    slug: page.slug,
    title: page.title,
    // Never the case body — only the summary the firm released to the client.
    content: portalReleasedSummary(page.frontmatter),
    frontmatter: {
      case_number: str(fm.case_number),
      status: str(fm.status),
      legal_area: str(fm.legal_area),
      client_name: str(fm.client_name),
      opponent_name: str(fm.opponent_name),
      court_name: str(fm.court_name),
      claims: Array.isArray(fm.claims)
        ? fm.claims.filter((c): c is string => typeof c === "string")
        : [],
      portal_enabled: fm.portal_enabled === true,
      deadlines,
      documents,
      client_alerts: (fm.client_alerts ?? [])
        .filter((a) => typeof a?.title === "string")
        .map((a) => ({
          id: a.id || a.title,
          title: a.title,
          summary: a.summary,
          url: a.url,
          date: a.date,
          severity: a.severity,
          impact_note: a.impact_note ?? "",
          published_at: a.published_at,
        })),
    },
  };
}

type ParsedRequest = { slug: string; frontmatter: DocumentRequestFrontmatter };

/** Only requests addressed to the client that were actually sent. Drafts and
 *  firm-internal requests (to a lawyer or assistant) stay inside the firm. */
export function isPortalVisibleRequest(request: ParsedRequest): boolean {
  const fm = request.frontmatter;
  return (
    (fm.recipient_role ?? "client") === "client" && fm.status !== "draft" && fm.status !== "expired"
  );
}

/** Allowlist of what the client sees of a request: no message draft, phone
 *  number, channel or internal document slugs. */
export function toPortalRequest(request: ParsedRequest) {
  return {
    slug: request.slug,
    frontmatter: {
      status: request.frontmatter.status,
      created_at: request.frontmatter.created_at,
      items: (request.frontmatter.items ?? []).map((item) => ({
        key: item.key,
        label: item.label,
        required: item.required === true,
        received: Boolean(item.received_document_slug),
      })),
    },
  };
}

/** Allowlist of a questionnaire for the client: no author or internal ids. */
export function toPortalQuestionnaire(q: Questionnaire) {
  return {
    id: q.id,
    title: q.title,
    fields: q.fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      options: f.options,
    })),
    status: q.status,
    answered_at: q.answered_at,
    answers: q.answers,
  };
}
