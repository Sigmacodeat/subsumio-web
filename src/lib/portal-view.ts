import type { BrainPage } from "@/lib/types";
import { caseFrontmatter, type DocumentEntry } from "@/lib/legal-types";

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

export interface PortalCaseView {
  slug: string;
  title: string;
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
    .filter((d) => typeof d.due_date === "string" && d.due_date)
    .map((d) => ({
      title: d.title || d.description || "Frist",
      due_date: d.due_date,
      status: d.status,
    }));
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return {
    slug: page.slug,
    title: page.title,
    content: page.content ?? "",
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
    },
  };
}
