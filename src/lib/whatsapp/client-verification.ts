import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { getWhatsAppIdentityStore } from "@/lib/whatsapp/identity-store";
import { normalizePhone, type WhatsAppIdentity } from "@/lib/whatsapp/types";
import { phoneHash } from "@/lib/whatsapp/verify";

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
const CODE_REGEX = /\b(?:code|pin|bestaetigen|bestätigen)?\s*(\d{6})\b/i;

export interface WhatsAppClientInviteInput {
  brainId: string;
  orgId: string;
  phone: string;
  caseSlug: string;
  clientName?: string;
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
  return text.match(CODE_REGEX)?.[1] ?? null;
}

function codesEqual(inputCode: string, storedHash: string): boolean {
  const given = Buffer.from(codeHash(inputCode), "hex");
  const wanted = Buffer.from(storedHash, "hex");
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

function inviteMessage(params: {
  clientName?: string;
  caseSlug: string;
  code: string;
  expiresAt: string;
}): string {
  const caseRef = params.caseSlug.replace(/^legal\/cases\//, "");
  return [
    `Hallo${params.clientName ? ` ${params.clientName}` : ""},`,
    `die Kanzlei moechte diese WhatsApp-Nummer fuer die Akte ${caseRef} bestaetigen.`,
    `Bitte antworten Sie mit: ${params.code}`,
    `Der Code ist bis ${new Date(params.expiresAt).toLocaleString("de-DE", { timeZone: "Europe/Vienna" })} gueltig.`,
    "Danach koennen Sie Unterlagen sicher per WhatsApp einreichen. Rechtsauskuenfte erfolgen erst nach Pruefung durch die Kanzlei.",
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
  const res = await fetchImpl(`${ENGINE_URL}/api/pages?type=whatsapp_client_invite&limit=100`, {
    headers: engineHeadersForBrain(brainId),
    signal: AbortSignal.timeout(15_000),
  });
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
  status: "verified" | "expired" | "failed",
  fetchImpl: typeof fetch
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
      },
      merge: true,
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => undefined);
}

export async function createWhatsAppClientInvite(
  input: WhatsAppClientInviteInput
): Promise<WhatsAppClientInvite> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? new Date();
  const normalizedPhone = normalizePhone(input.phone);
  const hash = phoneHash(normalizedPhone);
  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS).toISOString();
  const store = getWhatsAppIdentityStore();
  const existing = await store.getByPhoneHash(hash);
  const existingScope = Array.isArray(existing?.matterScope) ? existing.matterScope : [];
  const matterScope = Array.from(new Set([...existingScope, input.caseSlug]));
  const identity: WhatsAppIdentity = {
    id: existing?.id ?? `wa_${randomUUID()}`,
    orgId: input.orgId,
    brainId: input.brainId,
    phone: normalizedPhone,
    phoneHash: hash,
    userId: existing?.userId ?? input.invitedByUserId,
    name: input.clientName ?? existing?.name,
    role: "client",
    matterScope,
    status: "active",
    verifiedAt: existing?.verifiedAt ?? null,
    createdAt: existing?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const saved = existing ? await store.update(existing.id, identity) : await store.create(identity);
  const finalIdentity = saved ?? identity;
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
    identity: finalIdentity,
    code,
    expiresAt,
    message: inviteMessage({
      clientName: input.clientName,
      caseSlug: input.caseSlug,
      code,
      expiresAt,
    }),
  };
}

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
  const invite = invites[0];
  if (!invite) {
    return {
      ok: false,
      reason: "no_invite",
      reply: "Ich finde keine offene WhatsApp-Bestaetigung fuer diese Nummer.",
    };
  }

  const expiresAt = new Date(String(invite.frontmatter.expires_at ?? ""));
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < now.getTime()) {
    await markInvite(params.sender.brainId, invite.slug, "expired", fetchImpl);
    return {
      ok: false,
      reason: "expired",
      reply:
        "Der Bestaetigungscode ist abgelaufen. Bitte fordern Sie einen neuen Code bei der Kanzlei an.",
    };
  }

  const storedHash = String(invite.frontmatter.code_hash ?? "");
  if (!storedHash || !codesEqual(code, storedHash)) {
    await markInvite(params.sender.brainId, invite.slug, "failed", fetchImpl);
    return {
      ok: false,
      reason: "invalid_code",
      reply:
        "Der Bestaetigungscode passt nicht. Bitte pruefen Sie den Code oder fordern Sie einen neuen an.",
    };
  }

  const identityId = String(invite.frontmatter.identity_id ?? params.sender.id);
  const identity = await getWhatsAppIdentityStore().update(identityId, {
    role: "client",
    status: "active",
    verifiedAt: now.toISOString(),
    matterScope: [String(invite.frontmatter.case_slug)],
  });
  if (!identity) {
    return {
      ok: false,
      reason: "identity_missing",
      reply:
        "Die WhatsApp-Identity konnte nicht gefunden werden. Bitte kontaktieren Sie die Kanzlei.",
    };
  }

  await markInvite(params.sender.brainId, invite.slug, "verified", fetchImpl);
  return {
    ok: true,
    identity,
    caseSlug: String(invite.frontmatter.case_slug),
    inviteSlug: invite.slug,
    reply:
      "Danke, Ihre WhatsApp-Nummer ist bestaetigt. Sie koennen jetzt Nachrichten und Unterlagen zu dieser Akte senden.",
  };
}
