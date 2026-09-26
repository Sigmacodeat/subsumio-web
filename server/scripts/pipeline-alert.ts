/**
 * Outbound alert channel for the corpus pipeline and the RIS delta watcher.
 *
 * Alerts are always stored in pipeline_state.alert_flags by the callers;
 * this module makes them reach a person:
 *   - ALERT_WEBHOOK (optional): every alert, as before;
 *   - ops mail: severity "error"/"critical" go to QUEUE_ALERT_EMAIL via
 *     Resend (RESEND_API_KEY) — the same mailbox and provider cronjob.sh
 *     uses — at most once per source+type per PIPELINE_ALERT_INTERVAL_SECONDS
 *     (default 6 h), so an alert raised every 10-minute cycle does not flood.
 *
 * Never throws; the result says which channel was used.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface PipelineAlert {
  source: string;
  type: string;
  severity: string;
  message: string;
  raised_at?: string;
}

export interface ForwardOptions {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: number;
  stateDir?: string;
}

const MAIL_SEVERITIES = new Set(["error", "critical"]);

function throttleFile(stateDir: string, a: PipelineAlert): string {
  return join(stateDir, `${a.source}__${a.type}`.replace(/[^A-Za-z0-9_.-]/g, "_"));
}

export async function forwardAlert(
  alert: PipelineAlert,
  opts: ForwardOptions = {}
): Promise<{ webhook: boolean; mail: boolean }> {
  const env = opts.env ?? process.env;
  const doFetch = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now();
  const out = { webhook: false, mail: false };

  const webhook = env.ALERT_WEBHOOK;
  if (webhook) {
    try {
      const res = await doFetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(alert),
        signal: AbortSignal.timeout(10_000),
      });
      out.webhook = res.ok;
    } catch {
      // logged below via the caller's console line; never fatal
    }
  }

  if (!MAIL_SEVERITIES.has(alert.severity)) return out;
  const key = env.RESEND_API_KEY;
  const to = env.QUEUE_ALERT_EMAIL;
  if (!key || !to) {
    console.error(
      `  [alert] kein Mail-Kanal (RESEND_API_KEY/QUEUE_ALERT_EMAIL): ${alert.source} ${alert.type}`
    );
    return out;
  }

  const stateDir = opts.stateDir ?? env.PIPELINE_ALERT_STATE_DIR ?? "/tmp/pipeline-alerts";
  const intervalS = Number(env.PIPELINE_ALERT_INTERVAL_SECONDS ?? 21_600);
  const file = throttleFile(stateDir, alert);
  try {
    const last = Number(readFileSync(file, "utf8").trim());
    if (Number.isFinite(last) && now - last < intervalS * 1000) return out;
  } catch {
    // never sent
  }

  try {
    const res = await doFetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.MAIL_FROM || "Subsumio <hello@subsum.io>",
        to,
        subject: `Subsumio Korpus-Alarm (${alert.severity}): ${alert.source} ${alert.type}`,
        text: `${alert.message}\n\nQuelle: ${alert.source}\nZeitpunkt: ${alert.raised_at ?? new Date(now).toISOString()}\nDetails: /ops/corpus`,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    out.mail = res.ok;
    if (res.ok) {
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(file, `${now}\n`);
    } else {
      console.error(`  [alert] Mailversand fehlgeschlagen: HTTP ${res.status}`);
    }
  } catch (err) {
    console.error(`  [alert] Mailversand fehlgeschlagen: ${(err as Error).message}`);
  }
  return out;
}
