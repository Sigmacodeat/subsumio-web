import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { getWhatsAppIdentityStore } from "@/lib/whatsapp/identity-store";
import { normalizePhone, type PhoneCountry, type WhatsAppIdentity } from "@/lib/whatsapp/types";
import { phoneHash } from "@/lib/whatsapp/verify";
import {
  CLIENT_CONSENT_SCOPES,
  CLIENT_OPT_IN_TEXT,
  grantWhatsAppConsent,
} from "@/lib/whatsapp/consent-grant";

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
/** Wrong codes an invitation tolerates before it is closed. */
const MAX_CODE_ATTEMPTS = 5;
/**
 * Only a message that IS the code counts as an attempt ("123456",
 * "Code: 123456") — a client writing an amount or a file number with six
 * digits must never burn an invitation.
 */
const CODE_MESSAGE_REGEX = /^\s*(?:code|pin|bestaetigen|bestätigen)?\s*:?\s*(\d{6})\s*[.!]?\s*$/i;

/** Why an invitation cannot be created for this number. */
export class WhatsAppInviteConflictError extends Error {
  constructor(
    public readonly code: "phone_bound_other_firm" | "phone_bound_staff" | "phone_blocked",
    message: string
  ) {
    super(message);
    this.name = "WhatsAppInviteConflictError";
  }
}

export interface WhatsAppClientInviteInput {
  brainId: string;
  orgId: string;
  phone: string;
  caseSlug: string;
  clientName?: string;
  /** The firm's name — the client must see who is asking. */
  firmName?: string;
  /** Country for numbers written nationally ("0664 …"). */
  defaultCountry?: PhoneCountry;
  invitedByUserId?: string;
  invitedByName?: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}

export interface WhatsAppClientInvite {
  inviteSlug: string;
  identity: WhatsAppIdentity;
  code: string;
  expiresAt: string;
  message: string;
}

export interface WhatsAppClientVerificationResult {
  ok: boolean;
  reply: string;
  identity?: WhatsAppIdentity;
  caseSlug?: string;
  inviteSlug?: string;
  reason?: "not_code" | "no_invite" | "expired" | "invalid_code" | "identity_missing";
}

function codeHash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function safeSlugPart(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "invite"
  );
}

function extractCode(text: string): string | null {
  return text.match(CODE_MESSAGE_REGEX)?.[1] ?? null;
}

/** The message consists of a confirmation code only. */
export function isCodeMessage(text: string): boolean {
  return extractCode(text) !== null;
}

/** Link that opens a chat with the firm's business number, code prefilled. */
function businessChatLink(code: string): string | null {
  const digits = (process.env.WHATSAPP_BUSINESS_DISPLAY_NUMBER ?? "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(code)}` : null;
}

function codesEqual(inputCode: string, storedHash: string): boolean {
  const given = Buffer.from(codeHash(inputCode), "hex");
  const wanted = Buffer.from(storedHash, "hex");
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

function inviteMessage(params: {
  clientName?: string;
  firmName?: string;
  caseSlug: string;
  code: string;
  expiresAt: string;
}): string {
  const caseRef = params.caseSlug.replace(/^legal\/cases\//, "");
  const firm = params.firmName?.trim() || "Ihre Kanzlei";
  const link = businessChatLink(params.code);
  return [
    `Guten Tag${params.clientName ? ` ${params.clientName}` : ""},`,
    `${firm} möchte diese WhatsApp-Nummer für Ihre Akte ${caseRef} bestätigen.`,
    link
      ? `Bitte senden Sie den Code ${params.code} an die WhatsApp-Nummer der Kanzlei: ${link}`
      : `Bitte senden Sie den Code ${params.code} an die WhatsApp-Nummer der Kanzlei.`,
    `Der Code ist bis ${new Date(params.expiresAt).toLocaleString("de-AT", { timeZone: "Europe/Vienna" })} gültig.`,
    CLIENT_OPT_IN_TEXT,
    "Danach können Sie Unterlagen sicher per WhatsApp einreichen. Rechtsauskünfte erfolgen erst nach Prüfung durch die Kanzlei.",
  ].join("\n");
}

async function writeInvitePage(invite: {
  brainId: string;
  inviteSlug: string;
  phoneHash: string;
  identityId: string;
  caseSlug: string;
  clientName?: string;
  code: string;
  expiresAt: string;
  invitedByUserId?: string;
  invitedByName?: string;
  now: string;
  fetchImpl: typeof fetch;
}): Promise<void> {
  const res = await invite.fetchImpl(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...engineHeadersForBrain(invite.brainId),
    },
    body: JSON.stringify({
      slug: invite.inviteSlug,
      title: `WhatsApp Mandantenbestaetigung: ${invite.clientName ?? invite.phoneHash.slice(-8)}`,
      type: "whatsapp_client_invite",
      content: `Mandantenbestaetigung fuer ${invite.caseSlug}`,
      frontmatter: {
        type: "whatsapp_client_invite",
        status: "pending",
        phone_hash: invite.phoneHash,
        identity_id: invite.identityId,
        case_slug: invite.caseSlug,
        client_name: invite.clientName,
        code_hash: codeHash(invite.code),
        expires_at: invite.expiresAt,
        invited_by_user_id: invite.invitedByUserId,
        invited_by_name: invite.invitedByName,
        created_at: invite.now,
      },
      merge: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`whatsapp_client_invite_write_failed:${res.status}`);
}

async function listPendingInvites(
  brainId: string,
  hash: string,
  fetchImpl: typeof fetch
): Promise<Array<{ slug: string; frontmatter: Record<string, unknown> }>> {
  const res = await fetchImpl(
    `${ENGINE_URL}/api/pages?type=whatsapp_client_invite&limit=100&fm.phone_hash=${encodeURIComponent(hash)}`,
    {
      headers: engineHeadersForBrain(brainId),
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!res.ok) return [];
  const data = (await res.json().catch(() => ({}))) as {
    pages?: Array<{ slug?: string; frontmatter?: Record<string, unknown> }>;
    items?: Array<{ slug?: string; frontmatter?: Record<string, unknown> }>;
  };
  const pages = Array.isArray(data.pages)
    ? data.pages
    : Array.isArray(data.items)
      ? data.items
      : [];
  return pages
    .filter(
      (page): page is { slug: string; frontmatter: Record<string, unknown> } =>
        typeof page.slug === "string" &&
        page.frontmatter?.status === "pending" &&
        page.frontmatter?.phone_hash === hash
    )
    .sort((a, b) =>
      String(b.frontmatter.created_at ?? "").localeCompare(String(a.frontmatter.created_at ?? ""))
    );
}

async function markInvite(
  brainId: string,
  inviteSlug: string,
  status: "verified" | "expired" | "failed" | "pending",
  fetchImpl: typeof fetch,
  extra: Record<string, unknown> = {}
): Promise<void> {
  await fetchImpl(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...engineHeadersForBrain(brainId),
    },
    body: JSON.stringify({
      slug: inviteSlug,
      type: "whatsapp_client_invite",
      frontmatter: {
        status,
        verified_at: status === "verified" ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
        ...extra,
      },
      merge: true,
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => undefined);
}

/**
 * Invite a client's number for a matter. The number is only confirmed — and
 * the matter only added to its scope — when the client sends the code back
 * (verifyWhatsAppClientCode). An invitation never takes over a number that
 * belongs to another firm, to a firm member, or that the firm blocked.
 */
export async function createWhatsAppClientInvite(
  input: WhatsAppClientInviteInput
): Promise<WhatsAppClientInvite> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? new Date();
  const normalizedPhone = normalizePhone(input.phone, input.defaultCountry);
  const hash = phoneHash(normalizedPhone);
  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS).toISOString();
  const store = getWhatsAppIdentityStore();
  const existing = await store.getByPhoneHash(hash);
  if (existing && existing.orgId !== input.orgId) {
    throw new WhatsAppInviteConflictError(
      "phone_bound_other_firm",
      "Diese WhatsApp-Nummer ist bereits einer anderen Kanzlei zugeordnet."
    );
  }
  if (existing && existing.role !== "client") {
    throw new WhatsAppInviteConflictError(
      "phone_bound_staff",
      "Diese WhatsApp-Nummer gehört zu einem Kanzleikonto und kann nicht als Mandant eingeladen werden."
    );
  }
  if (existing && existing.status !== "active") {
    throw new WhatsAppInviteConflictError(
      "phone_blocked",
      "Diese WhatsApp-Nummer ist gesperrt. Eine Freischaltung ist nur durch die Administration möglich."
    );
  }

  let finalIdentity: WhatsAppIdentity;
  if (existing) {
    // Known client of this firm: nothing changes until the code comes back.
    finalIdentity = existing;
  } else {
    const identity: WhatsAppIdentity = {
      id: `wa_${randomUUID()}`,
      orgId: input.orgId,
      brainId: input.brainId,
      phone: normalizedPhone,
      phoneHash: hash,
      name: input.clientName,
      role: "client",
      // Pending: no matter until the client confirms the number.
      matterScope: [],
      status: "active",
      verifiedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    finalIdentity = await store.create(identity);
  }
  const inviteSlug = `legal/whatsapp-client-invites/${safeSlugPart(input.caseSlug)}-${hash.slice(-10)}-${now.getTime()}`;

  await writeInvitePage({
    brainId: input.brainId,
    inviteSlug,
    phoneHash: hash,
    identityId: finalIdentity.id,
    caseSlug: input.caseSlug,
    clientName: input.clientName,
    code,
    expiresAt,
    invitedByUserId: input.invitedByUserId,
    invitedByName: input.invitedByName,
    now: now.toISOString(),
    fetchImpl,
  });

  return {
    inviteSlug,
    identity: { ...finalIdentity, phone: normalizedPhone },
    code,
    expiresAt,
    message: inviteMessage({
      clientName: input.clientName,
      firmName: input.firmName,
      caseSlug: input.caseSlug,
      code,
      expiresAt,
    }),
  };
}

/**
 * Check a code message against ALL open invitations of this number. A match
 * confirms the number, adds that matter to the client's scope (keeping the
 * matters already confirmed) and records the client's WhatsApp consent. A
 * wrong code counts an attempt on the open invitations; they close only after
 * MAX_CODE_ATTEMPTS, so one typo never burns an invitation for another matter.
 */
export async function verifyWhatsAppClientCode(params: {
  sender: WhatsAppIdentity;
  text: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<WhatsAppClientVerificationResult> {
  const code = extractCode(params.text);
  if (!code) return { ok: false, reason: "not_code", reply: "" };

  const fetchImpl = params.fetchImpl ?? fetch;
  const now = params.now ?? new Date();
  const invites = await listPendingInvites(
    params.sender.brainId,
    params.sender.phoneHash,
    fetchImpl
  );
  if (invites.length === 0) {
    return {
      ok: false,
      reason: "no_invite",
      reply: "Ich finde keine offene WhatsApp-Bestätigung für diese Nummer.",
    };
  }

  const open: typeof invites = [];
  for (const invite of invites) {
    const expiresAt = new Date(String(invite.frontmatter.expires_at ?? ""));
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < now.getTime()) {
      await markInvite(params.sender.brainId, invite.slug, "expired", fetchImpl);
    } else {
      open.push(invite);
    }
  }
  if (open.length === 0) {
    return {
      ok: false,
      reason: "expired",
      reply:
        "Der Bestätigungscode ist abgelaufen. Bitte fordern Sie einen neuen Code bei der Kanzlei an.",
    };
  }

  const invite = open.find((i) => {
    const storedHash = String(i.frontmatter.code_hash ?? "");
    return storedHash !== "" && codesEqual(code, storedHash);
  });
  if (!invite) {
    for (const i of open) {
      const attempts = Number(i.frontmatter.failed_attempts ?? 0) + 1;
      await markInvite(
        params.sender.brainId,
        i.slug,
        attempts >= MAX_CODE_ATTEMPTS ? "failed" : "pending",
        fetchImpl,
        { failed_attempts: attempts }
      );
    }
    return {
      ok: false,
      reason: "invalid_code",
      reply:
        "Der Bestätigungscode passt nicht. Bitte prüfen Sie den Code oder fordern Sie einen neuen an.",
    };
  }

  const caseSlug = String(invite.frontmatter.case_slug);
  const store = getWhatsAppIdentityStore();
  const identityId = String(invite.frontmatter.identity_id ?? params.sender.id);
  const current = await store.getById(identityId);
  if (!current || current.orgId !== params.sender.orgId || current.role !== "client") {
    return {
      ok: false,
      reason: "identity_missing",
      reply:
        "Die WhatsApp-Identität konnte nicht gefunden werden. Bitte kontaktieren Sie die Kanzlei.",
    };
  }
  const scope = Array.isArray(current.matterScope) ? current.matterScope : [];
  const identity = await store.update(identityId, {
    status: "active",
    verifiedAt: now.toISOString(),
    matterScope: Array.from(new Set([...scope, caseSlug])),
  });
  if (!identity) {
    return {
      ok: false,
      reason: "identity_missing",
      reply:
        "Die WhatsApp-Identität konnte nicht gefunden werden. Bitte kontaktieren Sie die Kanzlei.",
    };
  }

  await markInvite(params.sender.brainId, invite.slug, "verified", fetchImpl);
  const consent = await grantWhatsAppConsent({
    brainId: params.sender.brainId,
    orgId: params.sender.orgId,
    phoneHash: params.sender.phoneHash,
    subjectType: "client",
    subjectRef: identity.id,
    scopes: CLIENT_CONSENT_SCOPES,
    source: "client_code",
    proof: { invite_slug: invite.slug, case_slug: caseSlug },
    now,
  }).catch(() => null);
  return {
    ok: true,
    identity,
    caseSlug,
    inviteSlug: invite.slug,
    reply: [
      "Danke, Ihre WhatsApp-Nummer ist bestätigt. Sie können jetzt Nachrichten und Unterlagen zu dieser Akte senden.",
      consent?.status === "withdrawn"
        ? "Sie hatten Nachrichten der Kanzlei abbestellt. Mit START erhalten Sie wieder Nachrichten."
        : null,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
