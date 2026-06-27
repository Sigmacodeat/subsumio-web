import type { IntakeRequestFrontmatter } from "@/lib/intake";

export interface IntakeConversionInput {
  slug: string;
  title?: string;
  content?: string;
  frontmatter: IntakeRequestFrontmatter;
}

export interface IntakeConversionOptions {
  caseSlug?: string;
  caseNumber?: string;
  title?: string;
  priority?: "low" | "medium" | "high" | "critical";
  portalEnabled?: boolean;
  convertedBy?: string;
  at?: Date;
}

export interface ConvertedCasePage {
  slug: string;
  title: string;
  type: "legal_case";
  content: string;
  frontmatter: Record<string, unknown>;
}

function safeSlugPart(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "intake"
  );
}

function inferTitle(intake: IntakeConversionInput): string {
  const fm = intake.frontmatter;
  if (fm.client_name && fm.legal_area) return `${fm.client_name} - ${fm.legal_area}`;
  if (fm.client_name) return fm.client_name;
  return intake.title?.replace(/^Intake:\s*/i, "").trim() || fm.summary.slice(0, 80) || "Neue Akte";
}

function inferCaseNumber(at: Date): string {
  return `${at.getFullYear()}-${String(at.getTime()).slice(-6)}`;
}

export function buildCaseFromIntake(
  intake: IntakeConversionInput,
  options: IntakeConversionOptions = {}
): ConvertedCasePage {
  const at = options.at ?? new Date();
  const fm = intake.frontmatter;
  const title = options.title?.trim() || inferTitle(intake);
  const caseNumber = options.caseNumber?.trim() || inferCaseNumber(at);
  const slug = options.caseSlug?.trim() || `legal/cases/${caseNumber}-${safeSlugPart(title)}`;
  const missingDocs = fm.missing_documents ?? [];
  const contentParts = [
    "## Intake",
    fm.summary,
    missingDocs.length
      ? `\n## Fehlende Unterlagen\n${missingDocs.map((doc) => `- ${doc}`).join("\n")}`
      : "",
  ].filter(Boolean);

  return {
    slug,
    title,
    type: "legal_case",
    content: contentParts.join("\n\n"),
    frontmatter: {
      type: "legal_case",
      case_number: caseNumber,
      status: "open",
      priority: options.priority ?? "medium",
      legal_area: fm.legal_area,
      client_name: fm.client_name,
      portal_enabled: options.portalEnabled ?? false,
      source: "intake",
      source_intake_slug: intake.slug,
      source_event_slug: fm.source_event_slug,
      created_via: "intake_conversion",
      created_at: at.toISOString(),
      updated_at: at.toISOString(),
      deadlines: [],
      documents: [],
      tasks: missingDocs.map((doc, index) => ({
        id: `missing-doc-${index + 1}`,
        text: `Unterlage anfordern: ${doc}`,
        done: false,
        createdAt: at.toISOString(),
      })),
      time_entries: [],
      expenses: [],
      communications: fm.source_event_slug
        ? [
            {
              id: `intake-${at.getTime()}`,
              channel: fm.source,
              direction: "incoming",
              summary: fm.summary,
              timestamp: fm.created_at,
            },
          ]
        : [],
      version: 0,
      converted_from_intake_at: at.toISOString(),
      converted_from_intake_by: options.convertedBy,
    },
  };
}
