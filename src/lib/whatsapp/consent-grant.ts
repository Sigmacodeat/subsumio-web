/**
 * Where WhatsApp consents come from (Paket 33 consent store).
 *
 * A firm may message a number proactively only with an active consent it
 * recorded itself (consent-store.ts, outbound-gate.ts). Consents are recorded
 * where they legally arise — always per firm, always with proof:
 *
 *  - `client_code`   a client confirmed their number with the invitation code.
 *                    The invitation states that the firm will communicate
 *                    about the matter over this channel (CLIENT_OPT_IN_TEXT);
 *                    sending the code back is the client's opt-in.
 *  - `start_keyword` the person themselves wrote "START" from this number.
 *  - `staff_setup`   an administrator registered a firm member's (business)
 *                    number for service messages — employment context, no
 *                    marketing.
 *  - `manual`        recorded by an administrator in the dashboard, with a note
 *                    on how it was obtained (e.g. signed mandate form).
 *
 * Decision (service replies within 24h): a reply to a message the client just
 * sent is a service message under WhatsApp Business rules, but the firm's
 * obligations (DSGVO Art. 6/7, § 9 RAO) still call for a documented basis.
 * The safe choice kept here: the outbound gate keeps requiring a consent, and a
 * verified client always has one (recorded at code verification). Unverified
 * numbers get only the direct webhook replies to their own messages.
 *
 * A withdrawal (STOPP) always wins: recording again never silently re-opens a
 * withdrawn consent — only the person's own START or an administrator's manual
 * record (with a note) does.
 */

import { randomUUID } from "node:crypto";
import { logAudit } from "@/lib/audit";
import type { OutboundScope } from "./outbound-gate";
import {
  getWhatsAppConsentStore,
  isConsentActive,
  whatsAppTenantKeys,
  type WhatsAppConsent,
  type WhatsAppConsentStore,
} from "./consent-store";

export type ConsentSource = "client_code" | "start_keyword" | "staff_setup" | "manual";

/** What a verified client receives: matter communication, reminders, documents. */
export const CLIENT_CONSENT_SCOPES: OutboundScope[] = [
  "client_reminder",
  "appointment_reminder",
  "new_document",
];

/** What a firm member receives on their business number. */
export const STAFF_CONSENT_SCOPES: OutboundScope[] = [
  "approval_request",
  "deadline_alert",
  "daily_briefing",
  "conflict_alert",
  "new_document",
];

/** The opt-in wording the client sees in the invitation. */
export const CLIENT_OPT_IN_TEXT =
  "Mit der Rücksendung des Codes willigen Sie ein, dass die Kanzlei Sie zu Ihrer Akte über WhatsApp kontaktiert (Nachrichten, Erinnerungen, Unterlagen). Mit STOPP können Sie das jederzeit widerrufen.";

export interface GrantConsentInput {
  brainId: string;
  orgId?: string | null;
  phoneHash: string;
  subjectType: WhatsAppConsent["subjectType"];
  /** userId for staff, identity id for clients. */
  subjectRef: string;
  scopes: OutboundScope[];
  source: ConsentSource;
  /** Extra proof fields (who, which invite, note …). */
  proof?: Record<string, unknown>;
  now?: Date;
  store?: WhatsAppConsentStore;
}

export type GrantConsentResult =
  | { status: "created" | "extended" | "reinstated"; consent: WhatsAppConsent }
  | { status: "withdrawn"; consent: WhatsAppConsent };

/**
 * Record (or extend) the firm's consent for this number. Returns
 * `withdrawn` without changing anything when the person opted out earlier and
 * the source is not allowed to re-open it.
 */
export async function grantWhatsAppConsent(input: GrantConsentInput): Promise<GrantConsentResult> {
  const store = input.store ?? getWhatsAppConsentStore();
  const now = (input.now ?? new Date()).toISOString();
  const tenantKey = input.orgId || input.brainId;
  const rows = await store.getByPhoneHash(
    whatsAppTenantKeys(input.brainId, input.orgId),
    input.phoneHash
  );
  const proof = {
    source: input.source,
    recorded_at: now,
    ...(input.source === "client_code" ? { text: CLIENT_OPT_IN_TEXT } : {}),
    ...(input.proof ?? {}),
  };
  const mayReopen = input.source === "start_keyword" || input.source === "manual";

  const active = rows.find(isConsentActive);
  if (active) {
    const scopes = Array.from(new Set([...active.scopes, ...input.scopes]));
    const updated =
      scopes.length === active.scopes.length
        ? active
        : ((await store.update(active.id, {
            scopes,
            consentProof: { ...active.consentProof, extended: proof },
          })) ?? active);
    return { status: "extended", consent: updated };
  }

  const withdrawn = rows.find((c) => c.optOutAt);
  if (withdrawn) {
    if (!mayReopen) return { status: "withdrawn", consent: withdrawn };
    const scopes = Array.from(new Set([...withdrawn.scopes, ...input.scopes]));
    const updated =
      (await store.update(withdrawn.id, {
        scopes,
        optOutAt: null,
        optInAt: now,
        consentProof: { ...withdrawn.consentProof, reinstated: proof },
      })) ?? withdrawn;
    await auditGrant(input, "reinstated");
    return { status: "reinstated", consent: updated };
  }

  const consent: WhatsAppConsent = {
    id: `wac_${randomUUID()}`,
    orgId: tenantKey,
    subjectType: input.subjectType,
    subjectRef: input.subjectRef,
    phoneHash: input.phoneHash,
    scopes: [...input.scopes],
    optInAt: now,
    optOutAt: null,
    consentProof: proof,
    createdAt: now,
    updatedAt: now,
  };
  await store.create(consent);
  await auditGrant(input, "created");
  return { status: "created", consent };
}

async function auditGrant(input: GrantConsentInput, how: "created" | "reinstated") {
  await logAudit("whatsapp.consent_granted", "whatsapp_identity", {
    brainId: input.brainId,
    details: {
      phoneHash: input.phoneHash,
      source: input.source,
      subjectType: input.subjectType,
      scopes: input.scopes,
      how,
    },
  }).catch(() => undefined);
}
