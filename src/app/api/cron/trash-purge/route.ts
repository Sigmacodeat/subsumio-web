import { NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { listEnginePages, type ListedPage } from "@/lib/engine-pages";
import { TRASH_TYPES, toTrashItem, isTrashExpired, type TrashItem } from "@/lib/trash";
import { isTombstoned } from "@/lib/tombstone";
import { getRecipientsByBrain } from "@/lib/cron-utils";
import { loadKanzleiSettingsForBrain } from "@/lib/kanzlei-settings-server";
import { normalizeTrashRetentionDays } from "@/lib/kanzlei-settings";
import { logAudit } from "@/lib/audit";
import { getSharedPgPool } from "@/lib/auth/store";
import { purgeExpiredSoftDeletedUsers } from "@/lib/user-purge";
import { purgeOldTrackingEvents } from "@/lib/email/tracking";
import { retentionUntil } from "@/lib/gobd";

import { logger } from "@/lib/logger";
const log = logger("api/cron/trash-purge");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * E-Mail-Tracking-Events (Öffnen/Klicken) tragen IP-Adresse und User-Agent
 * des Empfängers — personenbezogene Daten. Der Nachweis der Zustellung bleibt
 * über den aggregierten tracking_status der Nachricht erhalten, deshalb
 * reichen 90 Tage für die Einzelereignisse (Marktstandard für ESP-Logs und
 * im Einklang mit den sonstigen technischen Fristen dieses Jobs).
 */
const EMAIL_TRACKING_RETENTION_DAYS = 90;

/**
 * Seiten-Typen mit eigenständiger Aufbewahrungsfrist (DSGVO-Speicherbegrenzung,
 * Art. 5 Abs. 1 lit. e DSGVO). Frontmatter-Felder:
 *  - `retention_until` — ISO-Datum/-Zeitpunkt; ablaufendes Datum = Löschfälligkeit.
 *    Ein Datum ohne Uhrzeit ("2030-12-31") gilt bis einschließlich dieses Tags —
 *    dieselbe Semantik wie `retentionUntil()` in gobd.ts (§ 132 BAO: Ende des
 *    siebenten Folgejahres). GoBD-gestempelte Dokumente werden so nach Ablauf
 *    ihrer gesetzlichen Mindestfrist löschfällig.
 *  - `retention_days` — Tage ab `retention_from` (Frontmatter, optional) bzw.
 *    `created_at` der Page.
 * `retention_until` hat Vorrang vor `retention_days`. Abgelaufene Seiten werden
 * tombstoned (Papierkorb mit `tombstone_reason: "retention_expired"`) — die
 * normale Papierkorb-Frist und der Purge unten bleiben das Recovery-Fenster.
 */
const RETENTION_ITEM_TYPES = ["document", "note"] as const;

/**
 * Ablaufzeitpunkt einer Per-Item-Retention. Gibt den Ablauf zurück, wenn er
 * bereits eingetreten ist; `{ invalid: … }` bei unlesbarer Konfiguration
 * (fail-closed: nie wegen eines Tippfehlers löschen — aber sichtbar machen);
 * `null` bei keiner oder noch laufender Frist.
 */
function configuredRetentionExpiry(
  page: ListedPage,
  now: Date
): { expiresAt: Date } | { invalid: string } | null {
  const fm = page.frontmatter ?? {};
  const until = fm.retention_until;
  if (until !== undefined && until !== null && String(until).trim() !== "") {
    // YAML-Frontmatter kann Datumsangaben als Date-Objekt oder Zahl
    // (Epoch-ms) liefern — beides akzeptieren, sonst als String parsen.
    if (until instanceof Date || typeof until === "number") {
      const t = typeof until === "number" ? until : until.getTime();
      if (!Number.isFinite(t))
        return { invalid: `retention_until nicht lesbar: ${JSON.stringify(until)}` };
      return t <= now.getTime() ? { expiresAt: new Date(t) } : null;
    }
    if (typeof until !== "string")
      return { invalid: `retention_until mit unerwartetem Typ: ${JSON.stringify(until)}` };
    const raw = until.trim();
    const t = Date.parse(raw);
    if (!Number.isFinite(t)) return { invalid: `retention_until nicht lesbar: "${raw}"` };
    // Datum ohne Uhrzeit läuft am Ende des Tags ab (UTC), nicht davor.
    const expiresAt = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? t + 86_400_000 : t;
    return expiresAt <= now.getTime() ? { expiresAt: new Date(expiresAt) } : null;
  }
  const days = fm.retention_days;
  if (days !== undefined && days !== null && String(days) !== "") {
    const n = typeof days === "number" ? days : Number.parseFloat(String(days));
    if (!Number.isFinite(n) || n < 0)
      return { invalid: `retention_days ungültig: ${JSON.stringify(days)}` };
    const basisRaw = fm.retention_from ?? page.created_at;
    const basis =
      basisRaw instanceof Date ? basisRaw.getTime() : basisRaw ? Date.parse(String(basisRaw)) : NaN;
    if (!Number.isFinite(basis))
      return { invalid: "retention_days ohne lesbare Basis (retention_from/created_at)" };
    const expiresAt = basis + n * 86_400_000;
    return expiresAt <= now.getTime() ? { expiresAt: new Date(expiresAt) } : null;
  }
  return null;
}

/**
 * Konfigurierte Frist, geklemmt an die gesetzliche Untergrenze: ein
 * GoBD-gestempelter Beleg (`gobd_retention: true`, § 132 BAO) wird frühestens
 * am Ende des siebenten Folgejahres nach `hashed_at` löschfällig — egal, was
 * jemand über die generische Pages-API in `retention_until`/`retention_days`
 * geschrieben hat (die Felder sind dort nicht geschützt). Ohne lesbares
 * `hashed_at` ist die Mindestfrist nicht bestimmbar → fail-closed, sichtbar.
 */
function retentionExpiredAt(
  page: ListedPage,
  now: Date
): { expiresAt: Date } | { invalid: string } | { floored: Date } | null {
  const configured = configuredRetentionExpiry(page, now);
  if (!configured || "invalid" in configured) return configured;
  const fm = page.frontmatter ?? {};
  if (fm.gobd_retention !== true) return configured;
  const hashedRaw = fm.hashed_at;
  const hashed =
    hashedRaw instanceof Date
      ? hashedRaw.getTime()
      : hashedRaw
        ? Date.parse(String(hashedRaw))
        : NaN;
  if (!Number.isFinite(hashed)) {
    return {
      invalid: "gobd_retention ohne lesbares hashed_at — gesetzliche Mindestfrist nicht bestimmbar",
    };
  }
  // retentionUntil() liefert "YYYY-12-31" und gilt bis Ende dieses Tags (UTC).
  const floor = Date.parse(retentionUntil(new Date(hashed))) + 86_400_000;
  if (floor > now.getTime()) return { floored: new Date(floor) };
  return { expiresAt: new Date(Math.max(configured.expiresAt.getTime(), floor)) };
}

/**
 * GET /api/cron/trash-purge — endgültige Löschung abgelaufener Papierkorb-
 * Einträge (DSGVO-Löschkonzept).
 *
 * Zweistufiges Modell: dieser Job setzt den Engine-Soft-Delete (`deleted_at`)
 * auf Einträge, deren Aufbewahrungsfrist (Kanzlei-Setting `trashRetentionDays`,
 * Default 30 Tage) abgelaufen ist. Der Autopilot-Purge der Engine löscht sie
 * 72 h später physisch — bis dahin bleibt ein letztes Recovery-Fenster.
 *
 * Zusätzlich: Per-Item-Retention für Dokumente/Notizen — aktive Pages mit
 * `retention_until`/`retention_days` (s. RETENTION_ITEM_TYPES) werden nach
 * Fristablauf tombstoned und laufen danach dieselbe Papierkorb-Frist. Auch das
 * hängt an `trashAutoPurge`: eine Kanzlei, die automatisches Löschen abgestellt
 * hat, bekommt keine automatischen Retention-Tombstones.
 *
 * Fail-closed überall:
 *  - Settings unlesbar → Brain wird übersprungen (nie mit Defaults löschen).
 *  - `trashAutoPurge: false` → Brain wird übersprungen.
 *  - `legal_hold` auf dem Eintrag ODER seiner Akte → nie gelöscht.
 *  - Eintrag ohne `deleted_at`/`tombstoned_at` → nie gelöscht.
 *  - Einzelner Purge schlägt fehl → geht in errors[], Run antwortet 500.
 */
export const GET = createCronHandler(async () => {
  const now = new Date();
  const report = {
    purged: 0,
    skippedHold: 0,
    brainsDisabled: 0,
    retentionTombstoned: 0,
    retentionInvalid: 0,
    retentionGobdFloored: 0,
    failed: 0,
    errors: [] as string[],
  };

  const recipientsByBrain = await getRecipientsByBrain();

  for (const [brainId] of recipientsByBrain) {
    // Fail-closed: an unreadable settings page must not silently fall back to
    // "purge with defaults" — a firm that disabled auto-purge would lose data.
    let retentionDays: number;
    try {
      const settings = await loadKanzleiSettingsForBrain(brainId);
      if (settings.trashAutoPurge === false) {
        report.brainsDisabled++;
        continue;
      }
      retentionDays = normalizeTrashRetentionDays(settings.trashRetentionDays);
    } catch (err) {
      report.failed++;
      report.errors.push(
        `brain ${brainId}: settings unreadable — ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }

    const headers = engineHeadersForBrain(brainId);

    // Collect expired trash items across all trash types.
    const expired: TrashItem[] = [];
    try {
      for (const type of TRASH_TYPES) {
        const pages = await listEnginePages(headers, type, 5000, {
          includeTombstoned: true,
          strict: true,
        });
        for (const page of pages) {
          const item = toTrashItem(page);
          if (item && isTrashExpired(item, retentionDays, now)) expired.push(item);
        }
      }
    } catch (err) {
      report.failed++;
      report.errors.push(
        `brain ${brainId}: list failed — ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }
    // Legal hold: the item's own flag, plus its parent matter's hold — a held
    // case must protect everything in it (mirrors the DELETE guard in
    // api/pages/[...slug]). Case lookups are cached per brain; the retention
    // phase below uses the same check.
    const caseHold = new Map<string, boolean>();
    const caseIsHeld = async (caseSlug: string): Promise<boolean> => {
      const cached = caseHold.get(caseSlug);
      if (cached !== undefined) return cached;
      let held = false;
      try {
        const res = await fetch(
          `${ENGINE_URL}/api/pages/${caseSlug.split("/").map(encodeURIComponent).join("/")}`,
          { headers, signal: AbortSignal.timeout(10_000) }
        );
        if (res.ok) {
          const page = (await res.json()) as { frontmatter?: Record<string, unknown> };
          held = page.frontmatter?.legal_hold === true;
        } else {
          // 404/403/5xx: die Akte ist gerade nicht lesbar (oder weg) — dann
          // ist ihr Hold unbekannt. Fail-closed wie beim geworfenen Fehler:
          // nie auf Verdacht löschen; der nächste Lauf prüft erneut.
          held = true;
        }
      } catch {
        // Unreadable parent → treat as held (fail-closed, never purge on doubt).
        held = true;
      }
      caseHold.set(caseSlug, held);
      return held;
    };

    // Per-Item-Retention: aktive Dokumente/Notizen mit abgelaufener eigenen
    // Frist in den Papierkorb verschieben. Die Seiten bekommen ein frisches
    // tombstoned_at — gelöscht werden sie erst nach Ablauf der
    // Papierkorb-Frist durch den Purge unten (gleiche zweistufige Semantik
    // wie ein manuelles Löschen).
    try {
      for (const type of RETENTION_ITEM_TYPES) {
        const pages = await listEnginePages(headers, type, 5000, { strict: true });
        for (const page of pages) {
          if (isTombstoned(page)) continue;
          const fm = page.frontmatter ?? {};
          const expiry = retentionExpiredAt(page, now);
          if (!expiry) continue;
          if ("invalid" in expiry) {
            report.retentionInvalid++;
            report.errors.push(`${page.slug}: ${expiry.invalid}`);
            continue;
          }
          if ("floored" in expiry) {
            // Konfigurierte Frist abgelaufen, gesetzliche (§ 132 BAO) noch nicht.
            report.retentionGobdFloored++;
            continue;
          }
          try {
            const held =
              fm.legal_hold === true ||
              (fm.case_slug ? await caseIsHeld(String(fm.case_slug)) : false);
            if (held) {
              report.skippedHold++;
              continue;
            }
            const res = await enginePatchPage(
              headers,
              {
                slug: page.slug,
                frontmatter: {
                  status: "tombstoned",
                  tombstoned_at: now.toISOString(),
                  tombstoned_by: "cron:retention",
                  tombstone_reason: "retention_expired",
                },
              },
              { timeoutMs: 15_000 }
            );
            // 404 = bereits weg (Race mit manuellem Löschen) — nichts zu tun.
            if (!res.ok && res.status !== 404) {
              throw new Error(`retention tombstone returned HTTP ${res.status}`);
            }
            if (res.status === 404) continue;
            report.retentionTombstoned++;
            void logAudit("data.delete", "page", {
              entityId: page.slug,
              brainId,
              details: {
                title: page.title,
                type: page.type ?? String(fm.type ?? type),
                method: "retention_tombstone",
                expiresAt: expiry.expiresAt.toISOString(),
                reason: "retention_expired",
                brainId,
              },
            });
          } catch (err) {
            report.failed++;
            report.errors.push(
              `${page.slug}: retention tombstone — ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }
    } catch (err) {
      report.failed++;
      report.errors.push(
        `brain ${brainId}: retention scan failed — ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (expired.length === 0) continue;

    for (const item of expired) {
      try {
        const held =
          item.legal_hold === true || (item.case_slug ? await caseIsHeld(item.case_slug) : false);
        if (held) {
          report.skippedHold++;
          continue;
        }

        const path = item.slug.split("/").map(encodeURIComponent).join("/");
        const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
          method: "DELETE",
          headers,
          signal: AbortSignal.timeout(15_000),
        });
        // 404 = already gone (restored-and-redeleted race, or purged earlier).
        if (!res.ok && res.status !== 404) {
          throw new Error(`engine delete returned HTTP ${res.status}`);
        }

        report.purged++;
        void logAudit("trash.purge", "page", {
          brainId,
          entityId: item.slug,
          details: {
            title: item.title,
            type: item.type,
            kind: item.kind,
            deletedAt: item.deleted_at,
            reason: item.reason,
            retentionDays,
            brainId,
          },
        });

        // DSGVO-Vollständigkeit: Versionssnapshots tragen den Dokumentinhalt —
        // "endgültig gelöscht" muss sie mitnehmen, sonst lebt der Inhalt unter
        // legal/doc-versions/<slug>/ weiter.
        if (item.type === "document") {
          try {
            const versions = await listEnginePages(headers, "document_version", 200, {
              slugPrefix: `legal/doc-versions/${item.slug}/`,
            });
            for (const v of versions) {
              const vPath = v.slug.split("/").map(encodeURIComponent).join("/");
              const vRes = await fetch(`${ENGINE_URL}/api/pages/${vPath}`, {
                method: "DELETE",
                headers,
                signal: AbortSignal.timeout(15_000),
              });
              if (vRes.ok || vRes.status === 404) report.purged++;
              else throw new Error(`version ${v.slug}: HTTP ${vRes.status}`);
            }
          } catch (err) {
            report.failed++;
            report.errors.push(
              `${item.slug} versions: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      } catch (err) {
        report.failed++;
        report.errors.push(`${item.slug}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Soft-deleted users past their 30-day grace period are hard-deleted —
  // admin/data-delete only marks them; without this the promise never lands.
  // A hold placed after the soft-delete (during the grace window) is caught
  // here too: purgeExpiredSoftDeletedUsers re-checks per firm via the same
  // checkFirmLegalHolds() admin/data-delete used at the initial request.
  let usersPurged = 0;
  let trackingEventsPurged = 0;
  const pgPool = getSharedPgPool();
  if (pgPool) {
    try {
      usersPurged = await purgeExpiredSoftDeletedUsers(pgPool, report);
    } catch (err) {
      report.failed++;
      report.errors.push(`user purge: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      trackingEventsPurged = await purgeOldTrackingEvents(EMAIL_TRACKING_RETENTION_DAYS);
    } catch (err) {
      report.failed++;
      report.errors.push(
        `email-tracking purge: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // A run with errors answers 500 so supercronic marks the job FAILED.
  const ok = report.errors.length === 0;
  if (!ok) log.error("[trash-purge] completed with errors", { errors: report.errors });
  return NextResponse.json(
    { ok, ...report, users_purged: usersPurged, tracking_events_purged: trackingEventsPurged },
    { status: ok ? 200 : 500 }
  );
});
