/**
 * Server-side confirmation for Copilot actions that change or send something.
 *
 * The Copilot proposes an action; the server answers with a short-lived token
 * bound to the person, the tool and the exact parameters it shows back. The
 * action runs only with that token, once. A page script or an injected tool
 * marker can therefore not run the action without the confirmation step, and
 * nothing can swap the parameters between what was shown and what runs.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getAuthSecret } from "@/lib/auth/session";

/** Tools that change the firm's data or send something out. */
export const CONFIRMED_TOOLS: ReadonlySet<string> = new Set([
  "create_case",
  "intake_create",
  "time_entry",
  "document_request_create",
  "send_email",
  "deadline_mark_done",
  "create_task",
  "create_deadline",
  "create_contact",
  "request_signature",
  "create_automation_rule",
  "organize_documents",
  "render_template",
  "invoice_draft",
]);

const TTL_SECONDS = 10 * 60;
const used = new Map<string, number>();

function key(): string {
  return `copilot-confirmation:${getAuthSecret()}`;
}

/** Parameters in a stable form, so key order never changes the binding. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)])
    );
  }
  return value;
}

function paramsHash(params: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(params)))
    .digest("base64url");
}

function sign(body: string): string {
  return createHmac("sha256", key()).update(body).digest("base64url");
}

export function createToolConfirmation(
  userId: string,
  tool: string,
  params: Record<string, unknown>,
  now: number = Date.now()
): { token: string; expiresAt: string } {
  const exp = Math.floor(now / 1000) + TTL_SECONDS;
  const nonce = createHash("sha256")
    .update(`${userId}:${tool}:${now}:${Math.random()}`)
    .digest("base64url")
    .slice(0, 16);
  const body = Buffer.from(
    JSON.stringify({ u: userId, t: tool, p: paramsHash(params), exp, n: nonce })
  ).toString("base64url");
  return { token: `${body}.${sign(body)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export type ConfirmationCheck =
  | { ok: true }
  | { ok: false; reason: "missing" | "invalid" | "expired" | "mismatch" | "used" };

/** Checks and spends a confirmation token. */
export function consumeToolConfirmation(
  token: string | undefined,
  userId: string,
  tool: string,
  params: Record<string, unknown>,
  now: number = Date.now()
): ConfirmationCheck {
  if (!token) return { ok: false, reason: "missing" };
  const [body, sig] = token.split(".");
  if (!body || !sig) return { ok: false, reason: "invalid" };
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "invalid" };
  }
  let claims: { u: string; t: string; p: string; exp: number; n: string };
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  const nowSec = Math.floor(now / 1000);
  if (claims.exp < nowSec) return { ok: false, reason: "expired" };
  if (claims.u !== userId || claims.t !== tool || claims.p !== paramsHash(params)) {
    return { ok: false, reason: "mismatch" };
  }
  for (const [n, exp] of used) if (exp < nowSec) used.delete(n);
  if (used.has(claims.n)) return { ok: false, reason: "used" };
  used.set(claims.n, claims.exp);
  return { ok: true };
}
