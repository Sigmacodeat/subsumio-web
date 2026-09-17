// DocuSign envelopes and Connect events: what we send along and how we read
// it back.
//
// Our own values travel as envelope custom fields — the REST API has no
// "metadata" field (it is silently dropped). Connect returns them under
// envelopeSummary.customFields.textCustomFields (JSON) or
// <CustomFields><CustomField><Name/><Value/> (XML), provided "Include Custom
// Fields" is enabled in the Connect configuration.

export interface EnvelopeCustomFields {
  textCustomFields: Array<{ name: string; value: string; show: "false"; required: "false" }>;
}

export function buildEnvelopeCustomFields(
  values: Record<string, string | undefined>
): EnvelopeCustomFields {
  return {
    textCustomFields: Object.entries(values)
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
      .map(([name, value]) => ({
        name,
        value: value.slice(0, 100),
        show: "false",
        required: "false",
      })),
  };
}

export interface ConnectEvent {
  envelopeId?: string;
  /** Lower-case DocuSign status: sent, delivered, completed, declined, voided … */
  status?: string;
  customFields: Record<string, string>;
}

type CustomFieldsLike =
  | { textCustomFields?: Array<{ name?: string; value?: string }>; [key: string]: unknown }
  | undefined;

function readCustomFields(...sources: CustomFieldsLike[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const src of sources) {
    if (!src) continue;
    for (const f of src.textCustomFields ?? []) {
      if (f?.name && typeof f.value === "string" && !(f.name in out)) out[f.name] = f.value;
    }
    // Older payloads (and our own tests) carry flat values.
    for (const [k, v] of Object.entries(src)) {
      if (k !== "textCustomFields" && typeof v === "string" && !(k in out)) out[k] = v;
    }
  }
  return out;
}

export function parseConnectJson(raw: unknown): ConnectEvent {
  const body = (raw ?? {}) as {
    data?: {
      envelopeId?: string;
      envelopeSummary?: { status?: string; customFields?: CustomFieldsLike };
      envelope?: { customFields?: CustomFieldsLike; metadata?: CustomFieldsLike };
    };
  };
  const summary = body.data?.envelopeSummary;
  return {
    envelopeId: body.data?.envelopeId,
    status: summary?.status?.toLowerCase(),
    customFields: readCustomFields(
      summary?.customFields,
      body.data?.envelope?.customFields,
      body.data?.envelope?.metadata
    ),
  };
}

export function parseConnectXml(xml: string): ConnectEvent {
  const text = (tag: string, from = xml) =>
    from
      .match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, "i"))?.[1]
      ?.trim();
  // The envelope status is the first <Status> inside <EnvelopeStatus>, not a recipient's.
  const envelopeBlock = xml.match(/<EnvelopeStatus>([\s\S]*)<\/EnvelopeStatus>/i)?.[1] ?? xml;
  const withoutRecipients = envelopeBlock.replace(
    /<RecipientStatuses>[\s\S]*?<\/RecipientStatuses>/i,
    ""
  );
  const customFields: Record<string, string> = {};
  for (const m of xml.matchAll(/<CustomField>([\s\S]*?)<\/CustomField>/gi)) {
    const name = text("Name", m[1]);
    const value = text("Value", m[1]);
    if (name && value !== undefined) customFields[name] = value;
  }
  return {
    envelopeId: text("EnvelopeID", withoutRecipients) ?? text("EnvelopeId", withoutRecipients),
    status: text("Status", withoutRecipients)?.toLowerCase(),
    customFields,
  };
}

/** One processing per envelope AND status — "sent" must not swallow "completed". */
export function connectEventKey(event: Pick<ConnectEvent, "envelopeId" | "status">): string | null {
  return event.envelopeId && event.status ? `${event.envelopeId}:${event.status}` : null;
}

export const SIGNATURE_STATUS_FROM_DOCUSIGN: Record<string, string> = {
  created: "draft",
  sent: "sent",
  delivered: "sent",
  completed: "signed",
  declined: "declined",
  voided: "expired",
};

/** DocuSign's OAuth host matches the REST environment (demo vs. production). */
export function docusignOAuthHost(baseUrl: string, override?: string): string {
  if (override) return override.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return /demo\.docusign\.net/i.test(baseUrl) ? "account-d.docusign.com" : "account.docusign.com";
}
