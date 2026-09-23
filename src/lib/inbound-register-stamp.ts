/**
 * Posteingangsbuch-Stempel (server-only).
 *
 * Jeder Eingangskanal — Upload, Mandantenportal, E-Mail-Import, beA,
 * WhatsApp — muss einen `inbound_entry`-Eintrag schreiben, damit das
 * Eingangsbuch die revisionssichere Gesamtübersicht bleibt. Getrennt von
 * inbound-register.ts, weil das Shared-Modul auch in Client-Bundles landet.
 *
 * `stampInboundEntry` wirft bei Engine-Fehlern — der Aufrufer entscheidet.
 * `stampInboundEntryBestEffort` ist der Standardpfad für Intake-Routen:
 * ein fehlgeschlagener Stempel darf den Eingang selbst nie verlieren,
 * landet aber als `inbound_stamp`-Outbox-Task in der Drain-Queue, damit
 * der Register-Eintrag nachgeholt wird statt still zu fehlen.
 */

import { ENGINE_URL } from "@/lib/engine";
import {
  createInboundEntry,
  newInboundEntryId,
  type InboundChannel,
  type InboundEntry,
} from "@/lib/inbound-register";
import { enqueuePostUploadTask } from "@/lib/post-upload-outbox";

import { logger } from "@/lib/logger";
const log = logger("lib/inbound-register-stamp");

export interface StampInboundInput {
  channel: InboundChannel;
  subject: string;
  senderName?: string;
  senderAddress?: string;
  caseSlug?: string;
  documentSlug?: string;
  receivedBy?: string;
  notes?: string;
}

export interface StampOptions {
  /**
   * Fixed entry id — retries from the drain queue reuse it, so a second
   * attempt upserts the same register page instead of duplicating it.
   */
  entryId?: string;
  /** Injected fetch for testable lib callers (e.g. WhatsApp ingest). */
  fetchImpl?: typeof fetch;
}

export async function stampInboundEntry(
  headers: Record<string, string>,
  input: StampInboundInput,
  opts: StampOptions = {}
): Promise<InboundEntry> {
  const entry = createInboundEntry(input);
  if (opts.entryId) entry.id = opts.entryId;
  const titleSubject = (entry.subject || "Dokumenteneingang").slice(0, 160);
  const res = await (opts.fetchImpl ?? fetch)(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: `legal/inbound-register/${entry.id}`,
      title: `Posteingang: ${titleSubject}`,
      type: "inbound_entry",
      frontmatter: entry,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`inbound_stamp_failed_${res.status}`);
  }
  return entry;
}

/**
 * Stamps the register entry without ever throwing: a failed stamp is
 * logged AND enqueued as a durable `inbound_stamp` task, so the post-upload
 * drain retries it with backoff instead of the entry silently missing from
 * the revision-safe register.
 */
export async function stampInboundEntryBestEffort(
  headers: Record<string, string>,
  input: StampInboundInput,
  brainId: string,
  opts: StampOptions = {}
): Promise<void> {
  const entryId = opts.entryId ?? newInboundEntryId();
  try {
    await stampInboundEntry(headers, input, { ...opts, entryId });
  } catch (err) {
    log.error(
      `[inbound-stamp] ${input.channel} stamp failed — queued for retry:`,
      err instanceof Error ? err.message : String(err)
    );
    try {
      await enqueuePostUploadTask(
        {
          doc_slug: entryId,
          case_slug: input.caseSlug,
          brain_id: brainId,
          task_type: "inbound_stamp",
          inbound: { entry_id: entryId, input },
        },
        brainId
      );
    } catch (enqueueErr) {
      log.error(
        "[inbound-stamp] retry enqueue failed — entry will be missing from the register:",
        enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr)
      );
    }
  }
}
