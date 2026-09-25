/**
 * Engine writes that fail loudly.
 *
 * `fetch` does not throw on HTTP 4xx/5xx. A bare
 * `await fetch(`${ENGINE_URL}/api/pages`, { method: "POST", … })` therefore
 * treats a refused or failed save as success — the route reports "saved"
 * while nothing was stored. Every engine write goes through
 * `engineWriteOrThrow` (or checks `res.ok` itself); the CI guard
 * `scripts/check-unchecked-engine-writes.ts` rejects new bare writes.
 *
 * Kept free of server-only imports so route tests can use it unmocked.
 */

import { AppError } from "@/lib/errors";
import { readApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

const log = logger("lib/engine-write");

/** The engine refused or failed a write. Maps to 502 (409 stays 409). */
export class EngineWriteError extends AppError {
  readonly engineStatus: number;
  readonly engineCode?: string;
  /** Raw engine text — for server logs only, never sent to the client. */
  readonly engineMessage?: string;

  constructor(what: string, engineStatus: number, engineCode?: string, engineMessage?: string) {
    const conflict = engineStatus === 409;
    super(
      conflict
        ? `${what}: Der Datensatz wurde inzwischen geändert oder existiert bereits.`
        : `${what}: Speichern fehlgeschlagen. Bitte erneut versuchen.`,
      {
        code: conflict ? (engineCode ?? "conflict") : "engine_write_failed",
        statusCode: conflict ? 409 : 502,
        details: {
          engine_status: engineStatus,
          ...(engineCode ? { engine_code: engineCode } : {}),
        },
      }
    );
    this.engineStatus = engineStatus;
    this.engineCode = engineCode;
    this.engineMessage = engineMessage;
  }
}

/** Throw `EngineWriteError` unless the engine answered 2xx. Returns `res`. */
export async function assertEngineWriteOk(res: Response, what: string): Promise<Response> {
  if (res.ok) return res;
  let code: string | undefined;
  let message: string | undefined;
  try {
    const parsed = readApiError(await res.clone().json(), "");
    code = parsed.code;
    message = parsed.message || undefined;
  } catch {
    // Non-JSON error body: the status alone decides.
  }
  throw new EngineWriteError(what, res.status, code, message);
}

/**
 * `fetch` + status check for engine writes. Network/timeout errors propagate
 * as thrown by `fetch`; a non-2xx answer throws `EngineWriteError`.
 * `createHandler` turns both into an error response, so a route that awaits
 * this never reports success for an unsaved write.
 */
export async function engineWriteOrThrow(
  url: string,
  init: RequestInit,
  what = "Engine-Schreibvorgang"
): Promise<Response> {
  const res = await fetch(url, init);
  return assertEngineWriteOk(res, what);
}

/**
 * Best-effort engine write for side records (history, notifications, status
 * mirrors) whose loss must not fail the user's action. Never throws; a
 * refused or failed write is logged with its status and reported as `false`
 * so the caller can surface or count it instead of assuming success.
 */
export async function engineWriteBestEffort(
  url: string,
  init: RequestInit,
  what = "Engine-Schreibvorgang"
): Promise<boolean> {
  try {
    const res = await fetch(url, init);
    if (res.ok) return true;
    log.error(`[engine-write] ${what} not stored`, { status: res.status });
    return false;
  } catch (err) {
    log.error(`[engine-write] ${what} failed`, err instanceof Error ? err : { err: String(err) });
    return false;
  }
}
