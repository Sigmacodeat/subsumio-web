/**
 * Per-request correlation id (server only).
 *
 * Every API request gets an id — the caller's `x-request-id` when it is
 * well-formed, otherwise a fresh UUID. It is:
 *   - held in AsyncLocalStorage so the structured logger stamps it on every
 *     line written while the request runs (concurrency-safe, unlike the old
 *     module-level variable that nothing ever set);
 *   - forwarded to the engine as `x-request-id` (ctx.headers), so a web log
 *     line and the engine's work for the same request can be joined;
 *   - returned to the client as the `x-request-id` response header.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { setRequestIdProvider } from "@/lib/logger";

const store = new AsyncLocalStorage<{ requestId: string }>();

setRequestIdProvider(() => store.getStore()?.requestId);

const VALID_ID = /^[A-Za-z0-9._-]{8,80}$/;

export function resolveRequestId(incoming: string | null | undefined): string {
  return incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
}

export function currentRequestId(): string | undefined {
  return store.getStore()?.requestId;
}

export async function withRequestId<T extends Response>(
  requestId: string,
  fn: () => Promise<T>
): Promise<T> {
  const response = await store.run({ requestId }, fn);
  try {
    response.headers.set("x-request-id", requestId);
  } catch {
    // immutable headers (e.g. a proxied fetch Response) — the id is still logged
  }
  return response;
}
