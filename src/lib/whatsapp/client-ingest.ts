import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { applyMatterKnowledgeMutation } from "@/lib/matter-knowledge";
import type { CaseFrontmatter } from "@/lib/legal-types";
import type { StoredWhatsAppMedia } from "@/lib/whatsapp/media";
import type { WhatsAppIdentity, WhatsAppIncomingMessage } from "@/lib/whatsapp/types";

export interface WhatsAppClientIngestInput {
  sender: WhatsAppIdentity;
  message: WhatsAppIncomingMessage;
  eventSlug: string;
  normalizedText: string;
  media?: StoredWhatsAppMedia | null;
}

export interface WhatsAppClientIngestResult {
  handled: boolean;
  reply: string;
  caseSlug?: string;
  submissionSlug?: string;
  reason?: "not_client" | "unverified" | "no_scope" | "ambiguous_scope" | "no_content";
}

function isClientRole(role: WhatsAppIdentity["role"] | undefined): boolean {
  return role === "client";
}

function scopedMatters(sender: WhatsAppIdentity): string[] {
  return Array.isArray(sender.matterScope) ? sender.matterScope.filter(Boolean) : [];
}

function caseSlugFromText(text: string): string | undefined {
  const match = text.match(
    /\b(?:akt|akte|az|aktenzeichen)\s+([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?)/i
  );
  const ref = match?.[1]?.trim();
  if (!ref) return undefined;
  if (ref.includes("/")) {
    return ref.startsWith("legal/cases/") ? ref : `legal/cases/${ref.replace(/^\/+/, "")}`;
  }
  return `legal/cases/${ref}`;
}

function resolveClientMatter(sender: WhatsAppIdentity, text: string): string | null {
  const scope = scopedMatters(sender);
  const explicit = caseSlugFromText(text);
  if (explicit && scope.includes(explicit)) return explicit;
  if (scope.length === 1) return scope[0];
  return null;
}

function ambiguousReply(sender: WhatsAppIdentity): string {
  const matters = scopedMatters(sender)
    .map((slug) => slug.replace(/^legal\/cases\//, ""))
    .slice(0, 5)
    .join(", ");
  return [
    "Danke, Ihre Nachricht ist eingegangen.",
    matters
      ? `Bitte nennen Sie das Aktenzeichen, damit wir die Unterlage korrekt zuordnen koennen. Bekannte Akten: ${matters}.`
      : "Bitte nennen Sie das Aktenzeichen, damit wir die Unterlage korrekt zuordnen koennen.",
  ].join("\n");
}

function submissionStatement(input: WhatsAppClientIngestInput, caseSlug: string): string {
  if (input.media) {
    const caption = "caption" in input.message ? input.message.caption : undefined;
    return [
      `Mandant hat per WhatsApp eine Datei zur Akte ${caseSlug.replace(/^legal\/cases\//, "")} eingereicht.`,
      `Datei: ${input.media.filename}`,
      `Typ: ${input.media.mimeType}`,
      caption ? `Begleittext: ${caption}` : undefined,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return `Mandant teilte per WhatsApp mit: ${input.normalizedText.trim()}`;
}

async function readCaseFrontmatter(
  brainId: string,
  caseSlug: string,
  fetchImpl: typeof fetch
): Promise<{ title?: string; content?: string; type?: string; frontmatter: CaseFrontmatter }> {
  const res = await fetchImpl(
    `${ENGINE_URL}/api/pages/${caseSlug.split("/").map(encodeURIComponent).join("/")}`,
    {
      headers: engineHeadersForBrain(brainId),
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!res.ok) throw new Error(`case_fetch_failed:${res.status}`);
  const page = (await res.json()) as {
    title?: string;
    content?: string;
    type?: string;
    frontmatter?: Record<string, unknown>;
  };
  return {
    title: page.title,
    content: page.content,
    type: page.type,
    frontmatter: (page.frontmatter ?? {}) as CaseFrontmatter,
  };
}

async function writeCaseFrontmatter(
  brainId: string,
  caseSlug: string,
  page: { title?: string; content?: string; type?: string; frontmatter: CaseFrontmatter },
  fetchImpl: typeof fetch
): Promise<void> {
  const res = await fetchImpl(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...engineHeadersForBrain(brainId),
    },
    body: JSON.stringify({
      slug: caseSlug,
      title: page.title,
      content: page.content,
      type: page.type ?? "legal_case",
      frontmatter: page.frontmatter,
      merge: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`case_update_failed:${res.status}`);
}

async function writeSubmissionPage(
  input: WhatsAppClientIngestInput,
  caseSlug: string,
  statement: string,
  fetchImpl: typeof fetch
): Promise<string> {
  const slug = `legal/submissions/whatsapp/${input.message.id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
  const res = await fetchImpl(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...engineHeadersForBrain(input.sender.brainId),
    },
    body: JSON.stringify({
      slug,
      title: `WhatsApp Einreichung: ${input.sender.name ?? input.sender.phoneHash}`,
      type: "client_submission",
      content: statement,
      frontmatter: {
        type: "client_submission",
        channel: "whatsapp",
        case_slug: caseSlug,
        source_event_slug: input.eventSlug,
        sender_identity_id: input.sender.id,
        sender_name: input.sender.name,
        sender_role: input.sender.role,
        phone_hash: input.sender.phoneHash,
        message_id: input.message.id,
        message_type: input.message.type,
        normalized_text: input.normalizedText,
        review_status: "pending",
        media: input.media
          ? {
              filename: input.media.filename,
              mime_type: input.media.mimeType,
              sha256: input.media.sha256,
              size_bytes: input.media.sizeBytes,
              storage_provider: input.media.storageProvider,
              storage_path: input.media.storagePath,
            }
          : undefined,
        created_at: new Date().toISOString(),
      },
      merge: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`submission_write_failed:${res.status}`);
  return slug;
}

export async function ingestVerifiedClientWhatsAppSubmission(
  input: WhatsAppClientIngestInput,
  fetchImpl: typeof fetch = fetch
): Promise<WhatsAppClientIngestResult> {
  if (!isClientRole(input.sender.role)) {
    return { handled: false, reply: "", reason: "not_client" };
  }
  if (!input.sender.verifiedAt) {
    return {
      handled: false,
      reason: "unverified",
      reply:
        "Danke. Aus Sicherheitsgruenden muss diese WhatsApp-Nummer zuerst durch die Kanzlei bestaetigt werden.",
    };
  }

  const scope = scopedMatters(input.sender);
  if (scope.length === 0) {
    return {
      handled: false,
      reason: "no_scope",
      reply:
        "Danke. Diese Nummer ist noch keiner Akte zugeordnet. Die Kanzlei prueft die Nachricht und meldet sich.",
    };
  }

  const caseSlug = resolveClientMatter(input.sender, input.normalizedText);
  if (!caseSlug) {
    return {
      handled: true,
      reason: "ambiguous_scope",
      reply: ambiguousReply(input.sender),
    };
  }

  if (!input.media && !input.normalizedText.trim()) {
    return {
      handled: true,
      reason: "no_content",
      caseSlug,
      reply: "Danke, Ihre Nachricht ist eingegangen. Bitte senden Sie noch Text oder eine Datei.",
    };
  }

  const statement = submissionStatement(input, caseSlug);
  const submissionSlug = await writeSubmissionPage(input, caseSlug, statement, fetchImpl);
  const page = await readCaseFrontmatter(input.sender.brainId, caseSlug, fetchImpl);
  const mutation = applyMatterKnowledgeMutation(page.frontmatter, {
    action: "mark_party_assertion",
    factId: `client-submission-${input.message.id}`,
    statement,
    source: {
      type: "whatsapp",
      label: `WhatsApp Mandant ${input.sender.name ?? input.sender.phoneHash}`,
      slug: submissionSlug,
      quote: input.normalizedText || input.media?.filename,
    },
    actor: {
      id: input.sender.id,
      name: input.sender.name,
      type: "importer",
    },
    reason: "Mandanteninformation aus WhatsApp zur anwaltlichen Prüfung aufgenommen",
  });
  await writeCaseFrontmatter(
    input.sender.brainId,
    caseSlug,
    { ...page, frontmatter: mutation.frontmatter },
    fetchImpl
  );

  return {
    handled: true,
    caseSlug,
    submissionSlug,
    reply:
      "Danke, Ihre Nachricht/Unterlage wurde sicher zur Akte genommen. Die Kanzlei prueft den Inhalt.",
  };
}
