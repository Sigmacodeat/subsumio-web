/**
 * Post-deploy smoke test of the integrations.
 *
 * Run once by the operator after a deploy, inside the web container (it reads
 * that container's env). Every integration is probed with the cheapest call
 * that has no side effect — listing, key info, token exchange, never a send,
 * a completion or a transcription. Where no such call exists the check only
 * reports "configured" and says why.
 *
 * Output never contains a secret, not even a prefix: results are built from
 * HTTP status codes, provider error codes and env *names*; every line is
 * additionally scrubbed of all secret-looking env values before printing.
 *
 * Entry point: scripts/post-deploy-smoke.ts (bundled into the web image, see
 * Dockerfile.web). Logic lives here so it is typechecked and unit-tested with
 * the rest of src/.
 */

import { loadKeyring } from "../../server/src/core/file-encryption";

export type SmokeStatus =
  /** probe succeeded */
  | "ok"
  /** required but not configured */
  | "missing"
  /** configured, probe failed */
  | "error"
  /** optional and not configured */
  | "skipped"
  /** configured, but no side-effect-free probe exists */
  | "unchecked"
  /** works, with a caveat worth reading */
  | "warn";

export interface SmokeResult {
  service: string;
  required: boolean;
  configured: boolean;
  status: SmokeStatus;
  detail?: string;
}

/** Bound on every single probe; libraries have their own, this is the backstop. */
export const PROBE_TIMEOUT_MS = 15_000;

type Env = Record<string, string | undefined>;

function has(env: Env, name: string): boolean {
  return Boolean(env[name]?.trim());
}

// ── Error summaries (never echo response bodies) ─────────────────────────

const CODE_RE = /^[A-Za-z0-9_.-]{1,60}$/;

function safeCode(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return typeof v === "string" && CODE_RE.test(v) ? v : null;
}

/**
 * The provider's machine-readable error code from a JSON error body —
 * Resend `name`, Stripe/Graph/Anthropic/OpenRouter `error.{code,type}`,
 * OAuth `error` plus the Entra `AADSTS…` number. Free text is dropped.
 */
export function providerErrorCode(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const parts: string[] = [];
  const err = b.error;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const c = safeCode(e.code) ?? safeCode(e.type);
    if (c) parts.push(c);
  } else {
    const c = safeCode(err) ?? safeCode(b.name) ?? safeCode(b.code) ?? safeCode(b.type);
    if (c) parts.push(c);
  }
  const desc = typeof b.error_description === "string" ? b.error_description : "";
  const aad = desc.match(/AADSTS\d{4,8}/);
  if (aad) parts.push(aad[0]);
  return parts.length ? parts.join(" ") : null;
}

function statusHint(status: number): string {
  if (status === 401) return "Schlüssel ungültig oder abgelaufen";
  if (status === 403) return "keine Berechtigung";
  if (status === 404) return "nicht gefunden";
  if (status === 429) return "Rate-Limit";
  if (status >= 500) return "Dienst gestört";
  return "unerwartete Antwort";
}

export function httpCause(status: number, body: unknown): string {
  const code = providerErrorCode(body);
  return `HTTP ${status}${code ? ` ${code}` : ""} (${statusHint(status)})`;
}

/**
 * Short cause for an error thrown by a reused library. Only the HTTP status
 * and the provider code are taken from its message (libraries put the raw
 * response text there); anything else becomes a fixed description.
 */
export function libErrorCause(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return "Zeitüberschreitung";
    // Node puts socket errors on err.cause.code, Bun on err.code.
    const code =
      (err as { code?: unknown }).code ?? (err.cause as { code?: unknown } | undefined)?.code;
    if (typeof code === "string" && /^[A-Za-z_]{2,40}$/.test(code)) {
      return /^E(NOENT|ACCES|PERM|ISDIR|NOTDIR)$/.test(code)
        ? `Datei nicht lesbar (${code})`
        : `nicht erreichbar (${code})`;
    }
    if (err instanceof SyntaxError) return "keine gültige JSON-Datei";
    const m = err.message.match(/\b([45]\d\d)\b[:\s]*(\{[\s\S]*\})?/);
    if (m) {
      let body: unknown = null;
      try {
        body = m[2] ? JSON.parse(m[2]) : null;
      } catch {
        body = null;
      }
      return httpCause(Number(m[1]), body);
    }
    if (err.name === "TypeError" && /fetch/i.test(err.message)) return "nicht erreichbar";
    return `unerwarteter Fehler (${safeCode(err.name) ?? "Error"})`;
  }
  return "unerwarteter Fehler";
}

async function getJson(
  url: string,
  headers: Record<string, string>
): Promise<{ status: number; ok: boolean; body: unknown }> {
  const res = await fetch(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, ok: res.ok, body };
}

// ── Secret scrubbing ─────────────────────────────────────────────────────

const SECRET_NAME_RE = /(KEY|SECRET|TOKEN|PASSWORD|PASSWD|DSN|DATABASE_URL|CREDENTIAL|PRIVATE)/i;

/** Every env value that could be a secret (by name), longest first. */
export function secretValues(env: Env): string[] {
  const out = new Set<string>();
  for (const [name, value] of Object.entries(env)) {
    const v = value?.trim();
    if (!v || v.length < 6 || !SECRET_NAME_RE.test(name)) continue;
    out.add(v);
  }
  return [...out].sort((a, b) => b.length - a.length);
}

export function scrub(text: string, secrets: string[]): string {
  let s = text;
  for (const v of secrets) s = s.split(v).join("[verborgen]");
  return s;
}

// ── Required checks ──────────────────────────────────────────────────────

/** Domain part of MAIL_FROM ("Name <a@b.tld>" or "a@b.tld"), lower-cased. */
export function senderDomain(from: string): string | null {
  const addr = from.match(/<([^>]+)>/)?.[1] ?? from;
  const at = addr.trim().lastIndexOf("@");
  if (at < 0) return null;
  const domain = addr
    .trim()
    .slice(at + 1)
    .toLowerCase();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : null;
}

/**
 * Resend: key valid and the MAIL_FROM domain verified — by listing the
 * account's domains (GET /domains). Sends nothing. A sending-only key cannot
 * list domains; Resend answers 401 restricted_api_key, which still proves the
 * key is valid — reported as a warning.
 */
export async function checkResend(env: Env): Promise<SmokeResult> {
  const base = { service: "Resend (E-Mail)", required: true };
  if (!has(env, "RESEND_API_KEY")) {
    return { ...base, configured: false, status: "missing", detail: "RESEND_API_KEY fehlt" };
  }
  const { mailFrom } = await import("@/lib/mail");
  const domain = senderDomain(mailFrom());
  if (!domain) {
    return {
      ...base,
      configured: true,
      status: "error",
      detail: "MAIL_FROM hat keine gültige Adresse",
    };
  }
  const r = await getJson("https://api.resend.com/domains?limit=100", {
    Authorization: `Bearer ${env.RESEND_API_KEY!.trim()}`,
  });
  if (r.status === 401 && providerErrorCode(r.body) === "restricted_api_key") {
    return {
      ...base,
      configured: true,
      status: "warn",
      detail: `Schlüssel gültig (nur Senden) — Status von ${domain} im Resend-Dashboard prüfen`,
    };
  }
  if (!r.ok)
    return { ...base, configured: true, status: "error", detail: httpCause(r.status, r.body) };
  const list =
    (r.body as { data?: Array<{ name?: unknown; status?: unknown }> } | null)?.data ?? [];
  const match = list.find((d) => typeof d.name === "string" && d.name.toLowerCase() === domain);
  if (!match) {
    return {
      ...base,
      configured: true,
      status: "error",
      detail: `Absenderdomain ${domain} nicht im Resend-Konto`,
    };
  }
  const st = safeCode(match.status) ?? "unbekannt";
  return st === "verified"
    ? { ...base, configured: true, status: "ok", detail: `${domain} verifiziert` }
    : {
        ...base,
        configured: true,
        status: "error",
        detail: `${domain} nicht verifiziert (Status ${st})`,
      };
}

interface ReadinessCheck {
  status?: string;
  detail?: string;
}

/**
 * Engine, auth database and required config through the app's own readiness
 * probe (/api/readiness, operator view via CRON_SECRET). Three rows.
 */
export async function checkReadiness(env: Env): Promise<SmokeResult[]> {
  const origin = (
    env.SUBSUMIO_INTERNAL_URL?.trim() || `http://localhost:${env.PORT?.trim() || "3000"}`
  ).replace(/\/+$/, "");
  const rows: Array<[key: string, service: string]> = [
    ["engine", "Engine (Health)"],
    ["auth", "Auth-Datenbank"],
    ["config", "Pflicht-Konfiguration"],
  ];
  const headers: Record<string, string> = {};
  if (has(env, "CRON_SECRET")) headers.Authorization = `Bearer ${env.CRON_SECRET!.trim()}`;
  let checks: Record<string, ReadinessCheck> | null = null;
  let failure = "";
  try {
    const r = await getJson(`${origin}/api/readiness`, headers);
    const body = r.body as { checks?: Record<string, ReadinessCheck> } | null;
    if (body && typeof body.checks === "object" && body.checks) checks = body.checks;
    else failure = httpCause(r.status, r.body);
  } catch (err) {
    failure = `Web-App ${libErrorCause(err)}`;
  }
  return rows.map(([key, service]) => {
    const c = checks?.[key];
    if (!c) {
      return {
        service,
        required: true,
        configured: true,
        status: "error",
        detail: failure || "keine Angabe",
      };
    }
    const detail = typeof c.detail === "string" ? c.detail.slice(0, 160) : undefined;
    return c.status === "ok"
      ? { service, required: true, configured: true, status: "ok", detail }
      : {
          service,
          required: true,
          configured: true,
          status: "error",
          detail: `${safeCode(c.status) ?? "down"}${detail ? `: ${detail}` : ""}`,
        };
  });
}

/**
 * At-rest encryption of stored originals: the engine's own keyring loader
 * decides validity (base64, 32 bytes; retired keys valid JSON).
 */
export function checkStorageKey(env: Env): SmokeResult {
  const base = { service: "Speicher-Verschlüsselung", required: true };
  if (!has(env, "SUBSUMIO_STORAGE_ENCRYPTION_KEY")) {
    return {
      ...base,
      configured: false,
      status: "missing",
      detail: "SUBSUMIO_STORAGE_ENCRYPTION_KEY fehlt",
    };
  }
  // The loader's messages name only key ids and lengths; still, stay generic.
  try {
    loadKeyring({ ...env, SUBSUMIO_STORAGE_ENCRYPTION_RETIRED_KEYS: undefined });
  } catch {
    return {
      ...base,
      configured: true,
      status: "error",
      detail: "Schlüssel muss 32 Byte base64 sein (openssl rand -base64 32)",
    };
  }
  try {
    const ring = loadKeyring(env);
    if (!ring) throw new Error("no keyring");
    const retired = ring.keys.size - 1;
    return {
      ...base,
      configured: true,
      status: "ok",
      detail: `aktiver Schlüssel ${safeCode(ring.activeKeyId) ?? "?"}, 32 Byte${
        retired > 0 ? `, ${retired} alte(r)` : ""
      }`,
    };
  } catch {
    return {
      ...base,
      configured: true,
      status: "error",
      detail:
        "SUBSUMIO_STORAGE_ENCRYPTION_RETIRED_KEYS ungültig (JSON {id: base64-Schlüssel mit 32 Byte})",
    };
  }
}

/** Minimum length for HMAC/bearer secrets before a warning. */
export const MIN_SECRET_LENGTH = 32;

export function checkSecret(env: Env, name: string, service: string): SmokeResult {
  const v = env[name]?.trim();
  if (!v)
    return {
      service,
      required: true,
      configured: false,
      status: "missing",
      detail: `${name} fehlt`,
    };
  return v.length < MIN_SECRET_LENGTH
    ? {
        service,
        required: true,
        configured: true,
        status: "warn",
        detail: `kürzer als ${MIN_SECRET_LENGTH} Zeichen (openssl rand -hex 32)`,
      }
    : { service, required: true, configured: true, status: "ok" };
}

// ── Optional checks ──────────────────────────────────────────────────────

function skipped(service: string, names: string): SmokeResult {
  return {
    service,
    required: false,
    configured: false,
    status: "skipped",
    detail: `${names} nicht gesetzt`,
  };
}

/** Mistral: list models (GET /v1/models). No transcription. */
export async function checkMistral(env: Env): Promise<SmokeResult> {
  const service = "Mistral (Diktat)";
  if (!has(env, "MISTRAL_API_KEY")) return skipped(service, "MISTRAL_API_KEY");
  const r = await getJson("https://api.mistral.ai/v1/models", {
    Authorization: `Bearer ${env.MISTRAL_API_KEY!.trim()}`,
  });
  if (!r.ok)
    return {
      service,
      required: false,
      configured: true,
      status: "error",
      detail: httpCause(r.status, r.body),
    };
  const n = Array.isArray((r.body as { data?: unknown[] } | null)?.data)
    ? (r.body as { data: unknown[] }).data.length
    : null;
  return {
    service,
    required: false,
    configured: true,
    status: "ok",
    detail: n !== null ? `${n} Modelle` : undefined,
  };
}

/**
 * OpenRouter: key info (GET /key) — no completion. Flags an exhausted key
 * limit; shows the allowed data regions (EU routing is a product promise).
 */
export async function checkOpenRouter(env: Env, name: string): Promise<SmokeResult> {
  const service = name === "OPENROUTER_API_KEY" ? "OpenRouter" : "OpenRouter (Ersatzschlüssel)";
  if (!has(env, name)) return skipped(service, name);
  const base = (env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1").replace(
    /\/+$/,
    ""
  );
  const r = await getJson(`${base}/key`, { Authorization: `Bearer ${env[name]!.trim()}` });
  if (!r.ok)
    return {
      service,
      required: false,
      configured: true,
      status: "error",
      detail: httpCause(r.status, r.body),
    };
  const d =
    (
      r.body as {
        data?: { limit?: unknown; limit_remaining?: unknown; allowed_data_regions?: unknown };
      } | null
    )?.data ?? {};
  const regions = Array.isArray(d.allowed_data_regions)
    ? d.allowed_data_regions.map(safeCode).filter(Boolean).join(",")
    : "";
  const parts: string[] = [];
  if (typeof d.limit_remaining === "number")
    parts.push(`Restlimit ${d.limit_remaining.toFixed(2)} $`);
  if (regions) parts.push(`Datenregion ${regions}`);
  if (
    typeof d.limit === "number" &&
    typeof d.limit_remaining === "number" &&
    d.limit_remaining <= 0
  ) {
    return {
      service,
      required: false,
      configured: true,
      status: "error",
      detail: "Schlüssel-Limit aufgebraucht",
    };
  }
  return {
    service,
    required: false,
    configured: true,
    status: "ok",
    detail: parts.join(", ") || undefined,
  };
}

/** Anthropic: list one model (GET /v1/models?limit=1) — no completion. */
export async function checkAnthropic(env: Env): Promise<SmokeResult> {
  const service = "Anthropic";
  if (!has(env, "ANTHROPIC_API_KEY")) return skipped(service, "ANTHROPIC_API_KEY");
  const r = await getJson("https://api.anthropic.com/v1/models?limit=1", {
    "x-api-key": env.ANTHROPIC_API_KEY!.trim(),
    "anthropic-version": "2023-06-01",
  });
  return r.ok
    ? { service, required: false, configured: true, status: "ok" }
    : {
        service,
        required: false,
        configured: true,
        status: "error",
        detail: httpCause(r.status, r.body),
      };
}

const GRAPH_VARS = ["MS365_CLIENT_ID", "MS365_CLIENT_SECRET", "MS365_TENANT_ID", "MS365_MAILBOX"];

/**
 * Microsoft Graph: app token via client credentials, then the metadata of
 * the sync folder of MS365_MAILBOX (msgraph.ts, read-only).
 */
export async function checkGraph(env: Env): Promise<SmokeResult> {
  const service = "Microsoft 365 (Graph)";
  if (!GRAPH_VARS.some((n) => has(env, n))) return skipped(service, "MS365_*");
  const missing = GRAPH_VARS.filter((n) => !has(env, n));
  if (missing.length) {
    return {
      service,
      required: false,
      configured: true,
      status: "error",
      detail: `unvollständig: ${missing.join(", ")} fehlt`,
    };
  }
  const { getGraphToken, checkGraphMailbox } = await import("@/lib/msgraph");
  try {
    await getGraphToken();
  } catch (err) {
    return {
      service,
      required: false,
      configured: true,
      status: "error",
      detail: `Anmeldung: ${libErrorCause(err)}`,
    };
  }
  try {
    const box = await checkGraphMailbox();
    return {
      service,
      required: false,
      configured: true,
      status: "ok",
      detail: `Postfach lesbar (Ordner ${box.folder.slice(0, 40)})`,
    };
  } catch (err) {
    return {
      service,
      required: false,
      configured: true,
      status: "error",
      detail: `Postfach: ${libErrorCause(err)}`,
    };
  }
}

const DOCUSIGN_VARS = ["DOCUSIGN_INTEGRATION_KEY", "DOCUSIGN_SECRET_KEY", "DOCUSIGN_ACCOUNT_ID"];

/**
 * DocuSign: configuration only. The app signs in per user (authorization
 * code grant); DocuSign has no client-credentials grant, so there is no
 * token the installation could fetch without a user. docusign.ts decides
 * whether the configuration is usable (demo environment refused in production).
 */
export async function checkDocusign(env: Env): Promise<SmokeResult> {
  const service = "DocuSign";
  if (!DOCUSIGN_VARS.some((n) => has(env, n)) && !has(env, "DOCUSIGN_BASE_URL")) {
    return skipped(service, "DOCUSIGN_*");
  }
  const { docusignConfigProblem, docusignEnvironment } = await import("@/lib/docusign");
  const problem = docusignConfigProblem();
  if (problem === "not_configured") {
    const missing = DOCUSIGN_VARS.filter((n) => !has(env, n));
    return {
      service,
      required: false,
      configured: true,
      status: "error",
      detail: `unvollständig: ${missing.join(", ")} fehlt`,
    };
  }
  if (problem === "base_url_missing") {
    return {
      service,
      required: false,
      configured: true,
      status: "error",
      detail: "DOCUSIGN_BASE_URL fehlt (Pflicht in Produktion)",
    };
  }
  if (problem === "demo_environment_in_production") {
    return {
      service,
      required: false,
      configured: true,
      status: "error",
      detail: "DOCUSIGN_BASE_URL zeigt auf die Demo-Umgebung",
    };
  }
  const envName = docusignEnvironment() === "demo" ? "Demo-Umgebung" : "Produktionsumgebung";
  return {
    service,
    required: false,
    configured: true,
    status: "unchecked",
    detail: `${envName}; Schlüssel erst bei Anmeldung eines Nutzers prüfbar`,
  };
}

/** FCM: service-account file readable and an OAuth access token obtainable. Sends nothing. */
export async function checkFcm(env: Env): Promise<SmokeResult> {
  const service = "Firebase Push (FCM)";
  if (!has(env, "FCM_SERVICE_ACCOUNT_PATH")) return skipped(service, "FCM_SERVICE_ACCOUNT_PATH");
  const { loadFcmServiceAccount, fcmAccessToken } = await import("@/lib/fcm-auth");
  let account;
  try {
    account = await loadFcmServiceAccount();
  } catch (err) {
    const cause =
      err instanceof Error && /incomplete/.test(err.message)
        ? "Dienstkonto-Datei unvollständig (project_id, client_email, private_key)"
        : `Dienstkonto-Datei: ${libErrorCause(err)}`;
    return { service, required: false, configured: true, status: "error", detail: cause };
  }
  if (!account) return skipped(service, "FCM_SERVICE_ACCOUNT_PATH");
  try {
    await fcmAccessToken(account);
    return {
      service,
      required: false,
      configured: true,
      status: "ok",
      detail: "Zugriffstoken erhalten",
    };
  } catch (err) {
    // Signing errors come from the private key — never echo them.
    const m = err instanceof Error ? err.message.match(/FCM token request failed: (\d{3})/) : null;
    return {
      service,
      required: false,
      configured: true,
      status: "error",
      detail: m
        ? `Token: ${httpCause(Number(m[1]), null)}`
        : "Token: privater Schlüssel nicht verwendbar",
    };
  }
}

/** Stripe: read the balance (GET /v1/balance) — read-only; reports live/test mode. */
export async function checkStripe(env: Env): Promise<SmokeResult> {
  const service = "Stripe";
  if (!has(env, "STRIPE_SECRET_KEY")) return skipped(service, "STRIPE_SECRET_KEY");
  const r = await getJson("https://api.stripe.com/v1/balance", {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY!.trim()}`,
  });
  if (!r.ok)
    return {
      service,
      required: false,
      configured: true,
      status: "error",
      detail: httpCause(r.status, r.body),
    };
  const live = (r.body as { livemode?: unknown } | null)?.livemode === true;
  if (!live && env.NODE_ENV === "production") {
    return {
      service,
      required: false,
      configured: true,
      status: "warn",
      detail: "Testmodus-Schlüssel in Produktion",
    };
  }
  return {
    service,
    required: false,
    configured: true,
    status: "ok",
    detail: live ? "Live-Modus" : "Testmodus",
  };
}

/** Same shape as the ids the auth store issues (org_…, brain_…) and engine ids. */
const BRAIN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * DMS_ALLOWED_BRAIN_IDS: comma-separated brain ids. The app drops malformed
 * entries silently (dms/index.ts), so the raw value is checked here.
 */
export function checkDmsAllowList(env: Env): SmokeResult {
  const service = "DMS-Freigabeliste";
  const raw = env.DMS_ALLOWED_BRAIN_IDS ?? "";
  const dmsConfigured = has(env, "DMS_PROVIDER") && has(env, "DMS_BASE_URL");
  if (!raw.trim()) {
    return dmsConfigured
      ? {
          service,
          required: false,
          configured: false,
          status: "warn",
          detail: "DMS eingerichtet, aber DMS_ALLOWED_BRAIN_IDS leer — keine Kanzlei erhält es",
        }
      : skipped(service, "DMS_ALLOWED_BRAIN_IDS");
  }
  const entries = raw.split(",").map((s) => s.trim());
  const bad = entries.filter((e) => !BRAIN_ID_RE.test(e)).length;
  const ids = entries.filter((e) => BRAIN_ID_RE.test(e));
  const dupes = ids.length - new Set(ids).size;
  if (bad > 0 || dupes > 0) {
    const why = [bad ? `${bad} ungültige(r) Eintrag/Einträge` : "", dupes ? `${dupes} doppelt` : ""]
      .filter(Boolean)
      .join(", ");
    return {
      service,
      required: false,
      configured: true,
      status: "error",
      detail: `${why} (Format: id1,id2)`,
    };
  }
  return dmsConfigured
    ? {
        service,
        required: false,
        configured: true,
        status: "ok",
        detail: `${ids.length} Kanzlei(en)`,
      }
    : {
        service,
        required: false,
        configured: true,
        status: "warn",
        detail: "Liste gesetzt, aber DMS_PROVIDER/DMS_BASE_URL fehlen",
      };
}

// ── Runner ───────────────────────────────────────────────────────────────

async function guarded(
  service: string,
  required: boolean,
  fn: () => Promise<SmokeResult | SmokeResult[]> | SmokeResult
): Promise<SmokeResult[]> {
  try {
    const r = await fn();
    return Array.isArray(r) ? r : [r];
  } catch (err) {
    return [{ service, required, configured: true, status: "error", detail: libErrorCause(err) }];
  }
}

export async function runSmoke(env: Env = process.env): Promise<SmokeResult[]> {
  const groups = await Promise.all([
    guarded("Resend (E-Mail)", true, () => checkResend(env)),
    guarded("Engine (Health)", true, () => checkReadiness(env)),
    guarded("Speicher-Verschlüsselung", true, () => checkStorageKey(env)),
    guarded("CRON_SECRET", true, () => checkSecret(env, "CRON_SECRET", "CRON_SECRET")),
    guarded("PORTAL_TOKEN_SECRET", true, () =>
      checkSecret(env, "PORTAL_TOKEN_SECRET", "PORTAL_TOKEN_SECRET")
    ),
    guarded("Mistral (Diktat)", false, () => checkMistral(env)),
    guarded("OpenRouter", false, () => checkOpenRouter(env, "OPENROUTER_API_KEY")),
    guarded("OpenRouter (Ersatzschlüssel)", false, () =>
      checkOpenRouter(env, "OPENROUTER_API_KEY_FALLBACK")
    ),
    guarded("Anthropic", false, () => checkAnthropic(env)),
    guarded("Microsoft 365 (Graph)", false, () => checkGraph(env)),
    guarded("DocuSign", false, () => checkDocusign(env)),
    guarded("Firebase Push (FCM)", false, () => checkFcm(env)),
    guarded("Stripe", false, () => checkStripe(env)),
    guarded("DMS-Freigabeliste", false, () => checkDmsAllowList(env)),
  ]);
  return groups.flat();
}

/** A required service missing or failing; with `strict`, a failing optional one too. */
export function isFailure(r: SmokeResult, strict = false): boolean {
  if (r.status === "missing") return r.required;
  if (r.status === "error") return r.required || strict;
  return false;
}

export function exitCode(results: SmokeResult[], strict = false): number {
  return results.some((r) => isFailure(r, strict)) ? 1 : 0;
}

function resultText(r: SmokeResult): string {
  const d = r.detail ? `: ${r.detail}` : "";
  switch (r.status) {
    case "ok":
      return `ok${r.detail ? ` (${r.detail})` : ""}`;
    case "missing":
      return `fehlt${d}`;
    case "error":
      return `Fehler${d}`;
    case "skipped":
      return "nicht eingerichtet (optional)";
    case "unchecked":
      return `konfiguriert, nicht prüfbar${d}`;
    case "warn":
      return `Hinweis${d}`;
  }
}

/** Table "Dienst | konfiguriert? | Ergebnis", scrubbed of every secret env value. */
export function renderTable(results: SmokeResult[], env: Env = process.env): string {
  const secrets = secretValues(env);
  const rows = results.map((r) => [
    `${r.service}${r.required ? " *" : ""}`,
    r.configured ? "ja" : "nein",
    resultText(r),
  ]);
  const head = ["Dienst", "konfiguriert?", "Ergebnis"];
  const w0 = Math.max(head[0].length, ...rows.map((r) => r[0].length));
  const w1 = Math.max(head[1].length, ...rows.map((r) => r[1].length));
  const line = (c: string[]) => `${c[0].padEnd(w0)} | ${c[1].padEnd(w1)} | ${c[2]}`;
  const out = [
    line(head),
    `${"-".repeat(w0)}-+-${"-".repeat(w1)}-+-${"-".repeat(8)}`,
    ...rows.map(line),
  ];
  out.push("", "* Pflichtdienst");
  return scrub(out.join("\n"), secrets);
}
