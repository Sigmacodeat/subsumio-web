/**
 * deadline-guarded-write.ts — server-side write of ONE standalone deadline
 * page for writers outside the generic page routes (Copilot, beA send and
 * receipt, automations).
 *
 * Reads the stored page (fail closed), refuses anything that is not a
 * deadline page (a matter slug would otherwise be closed instead of the
 * Frist), applies the full deadline rule set (`guardDeadlineWrite`: four-eyes
 * rule for Notfristen, identity stamps, Notfrist change protection, audit
 * trail), bumps the page version and records the change events in the audit
 * log.
 */

import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { GUARD_READ_FAILED, type GuardRejection, readCurrentPage } from "@/lib/page-write-guards";
import {
  type DeadlineChangeEvent,
  type PolicyUser,
  guardDeadlineWrite,
  isDeadlinePage,
} from "@/lib/deadline-write-policy";
import { logDeadlineEvents } from "@/lib/deadline-audit";

export interface GuardedWriteContext {
  headers: Record<string, string>;
  user: PolicyUser;
  brainId?: string;
}

export type GuardedDeadlineWriteResult =
  | { ok: true; events: DeadlineChangeEvent[] }
  | { ok: false; rejection: GuardRejection };

const NOT_FOUND: GuardRejection = {
  status: 404,
  error: "not_found",
  message: "Frist nicht gefunden.",
};

const NOT_A_DEADLINE: GuardRejection = {
  status: 400,
  error: "not_a_deadline",
  message: "Die Seite ist keine Frist.",
};

/** True for the four-eyes refusal of a Notfrist completion. */
export function isSecondCheckRejection(r: GuardRejection): boolean {
  return r.error === "notfrist_second_check_required";
}

export async function writeDeadlineGuarded(
  ctx: GuardedWriteContext,
  slug: string,
  patch: Record<string, unknown>,
  opts?: { timeoutMs?: number }
): Promise<GuardedDeadlineWriteResult> {
  const read = await readCurrentPage(ENGINE_URL, ctx.headers, slug);
  if (read.kind === "error") return { ok: false, rejection: GUARD_READ_FAILED };
  if (read.kind === "missing") return { ok: false, rejection: NOT_FOUND };
  const current = read.page;
  const fm = (current.frontmatter ?? {}) as Record<string, unknown>;
  if (!isDeadlinePage(current.type, fm.type, current.slug ?? slug)) {
    return { ok: false, rejection: NOT_A_DEADLINE };
  }

  const verdict = guardDeadlineWrite({
    slug,
    type: current.type,
    incoming: patch,
    current,
    user: ctx.user,
  });
  if ("reject" in verdict) return { ok: false, rejection: verdict.reject };

  const storedVersion = Number(fm.version);
  const res = await enginePatchPage(
    ctx.headers,
    {
      slug,
      frontmatter: {
        ...verdict.frontmatter,
        version: (Number.isFinite(storedVersion) ? storedVersion : 0) + 1,
      },
    },
    { timeoutMs: opts?.timeoutMs ?? 15_000 }
  );
  if (!res.ok) {
    return {
      ok: false,
      rejection: {
        status: res.status === 403 ? 403 : 502,
        error: res.status === 403 ? "engine_refused" : "engine_write_failed",
        message: "Die Frist konnte nicht gespeichert werden.",
      },
    };
  }
  await logDeadlineEvents(
    { brainId: ctx.brainId, user: { id: ctx.user.id, email: ctx.user.email } },
    verdict.events
  );
  return { ok: true, events: verdict.events };
}

/**
 * After a filing (beA/ERV) was transmitted: complete the linked deadline.
 * A Notfrist is never completed here — the filing is recorded on it
 * (`filing_status: "submitted"` plus the references in `extra`) and it stays
 * open until a second person confirms it in the second check.
 *
 * Never throws; `updated` says whether anything was stored.
 */
export async function completeDeadlineAfterFiling(
  ctx: GuardedWriteContext,
  slug: string,
  extra: Record<string, unknown>
): Promise<{ updated: boolean; second_check_required: boolean; error?: string }> {
  const now = new Date().toISOString();
  try {
    const done = await writeDeadlineGuarded(ctx, slug, {
      ...extra,
      status: "done",
      done_at: now,
      ...(ctx.user.email ? { done_by: ctx.user.email } : {}),
    });
    if (done.ok) return { updated: true, second_check_required: false };
    if (!isSecondCheckRejection(done.rejection)) {
      return { updated: false, second_check_required: false, error: done.rejection.error };
    }
    const recorded = await writeDeadlineGuarded(ctx, slug, {
      ...extra,
      filing_status: "submitted",
      filed_at: now,
    });
    return recorded.ok
      ? { updated: true, second_check_required: true }
      : { updated: false, second_check_required: true, error: recorded.rejection.error };
  } catch {
    return { updated: false, second_check_required: false, error: "engine_unreachable" };
  }
}
