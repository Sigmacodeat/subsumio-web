/**
 * Case scanner — on demand only.
 *
 * POST mode "preview": which of the caller's visible matters the scan covers
 * (one, a selection, or all open — capped at CASE_SCAN_MAX_CASES) and what it
 * costs (matters × CREDIT_COSTS.case_scan), with the current balance.
 * POST mode "start": the confirmed preview (`expected_credits`) is re-checked,
 * the balance must cover it (402 otherwise), every matter is booked before
 * its agent run starts, and bookings of matters that did not start are
 * refunded. Nothing is charged for skipped matters.
 * GET ?scan_id=: status of the caller's runs of one scan; runs that ended
 * without a result are refunded (idempotent per matter).
 *
 * Results land as review items in "Eingang prüfen"; nothing is written into
 * the matter. There is no scheduled run (see /api/cron/case-scanner).
 */
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ENGINE_URL } from "@/lib/engine";
import {
  apiError,
  apiSuccess,
  createHandler,
  recordCreditConsumption,
  type HandlerContext,
} from "@/lib/api-handler";
import {
  checkCredits,
  ensureTrialCredits,
  getBalance,
  refundConsumptionBooking,
} from "@/lib/billing/credits";
import { CREDIT_COSTS } from "@/lib/billing/credit-constants";
import {
  CASE_SCAN_FAILED_STATES,
  CASE_SCAN_MAX_CASES,
  caseScanBookingKey,
  caseScanCost,
  type CaseScanPreview,
  type CaseScanPreviewCase,
  type CaseScanSkipped,
  type CaseScanStartResult,
  type CaseScanStatus,
} from "@/lib/legal/case-scan";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const log = logger("api/legal/case-scanner");

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const scanSchema = z
  .object({
    mode: z.enum(["preview", "start"]),
    scope: z.enum(["case", "selection", "all_open"]),
    case_slugs: z.array(z.string().min(1).max(300)).min(1).max(CASE_SCAN_MAX_CASES).optional(),
    look_ahead_days: z.number().int().min(1).max(90).optional(),
    evidence_threshold: z.number().int().min(0).max(10).optional(),
    /** The total the user confirmed in the preview (start only). */
    expected_credits: z.number().int().min(0).optional(),
  })
  .strict()
  .refine((b) => (b.scope === "all_open" ? !b.case_slugs : !!b.case_slugs?.length), {
    message: "case_slugs_scope_mismatch",
  })
  .refine((b) => b.scope !== "case" || b.case_slugs?.length === 1, {
    message: "case_scope_needs_one_slug",
  });

const statusSchema = z.object({
  scan_id: z.string().regex(/^scan-[0-9a-f-]{36}$/),
});

type ScanBody = z.infer<typeof scanSchema>;

class EngineCallError extends Error {
  constructor(readonly status: number) {
    super(`engine ${status}`);
  }
}

async function callEngine<T>(
  ctx: HandlerContext,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown }
): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    method: init.method,
    headers: { ...ctx.headers, "Content-Type": "application/json" },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new EngineCallError(res.status);
  return (await res.json()) as T;
}

/** No real credits move in demo sessions or the E2E harness. */
function billingBypassed(ctx: HandlerContext): boolean {
  return Boolean(ctx.demo) || env("SUBSUMIO_E2E") === "1";
}

function engineFailure(): Response {
  return apiError(
    "service_unavailable",
    "Die Akten konnten gerade nicht geprüft werden. Bitte später erneut versuchen.",
    503
  );
}

async function preview(
  ctx: HandlerContext,
  body: ScanBody
): Promise<{
  cases: CaseScanPreviewCase[];
  skipped: CaseScanSkipped[];
  truncated: boolean;
}> {
  return callEngine(ctx, "/api/legal/case-scanner", {
    method: "POST",
    body: {
      mode: "preview",
      scope: body.scope,
      ...(body.case_slugs ? { case_slugs: body.case_slugs } : {}),
      look_ahead_days: body.look_ahead_days ?? 7,
      evidence_threshold: body.evidence_threshold ?? 1,
      limit: CASE_SCAN_MAX_CASES,
    },
  });
}

export const POST = createHandler(
  {
    action: "legal.case_scanner",
    rateTier: "heavy",
    body: scanSchema,
    audit: (_ctx, b) => ({
      action: "legal.case_scanner" as const,
      entityType: "case",
      details: {
        mode: b.mode,
        scope: b.scope,
        requested: b.case_slugs?.length ?? null,
        expectedCredits: b.expected_credits ?? null,
      },
    }),
  },
  async (ctx, body) => {
    let selection: Awaited<ReturnType<typeof preview>>;
    try {
      selection = await preview(ctx, body);
    } catch (e) {
      log.warn(`[case-scanner] preview failed: ${e instanceof Error ? e.message : String(e)}`);
      return engineFailure();
    }
    const count = selection.cases.length;
    const total = caseScanCost(count);
    const bypass = billingBypassed(ctx);

    if (body.mode === "preview") {
      let balance: number | null = null;
      if (!bypass) {
        await ensureTrialCredits(ctx.billing.ownerId, ctx.billing.ownerType);
        balance = (await getBalance(ctx.billing.ownerId, ctx.billing.ownerType)).balance;
      }
      const result: CaseScanPreview = {
        cases: selection.cases,
        skipped: selection.skipped,
        truncated: selection.truncated,
        count,
        credits_per_case: CREDIT_COSTS.case_scan,
        total_credits: total,
        balance,
        sufficient: bypass || (balance ?? 0) >= total,
        max_cases: CASE_SCAN_MAX_CASES,
      };
      return apiSuccess(result);
    }

    // ── start ──
    if (ctx.demo) {
      return apiError("demo_unavailable", "Der Akten-Scan ist in der Demo nicht verfügbar.", 403);
    }
    if (body.expected_credits === undefined) {
      return apiError(
        "confirmation_required",
        "Bitte zuerst die Kostenvorschau ansehen und bestätigen.",
        400
      );
    }
    if (body.expected_credits !== total) {
      return apiError(
        "preview_outdated",
        `Die Auswahl hat sich geändert: Der Scan umfasst jetzt ${count} Akten (${total} Credits). Bitte die Vorschau erneut bestätigen.`,
        409,
        { count, total_credits: total }
      );
    }
    if (count === 0) {
      const empty: CaseScanStartResult = {
        scan_id: "",
        launched: [],
        failed: [],
        skipped: selection.skipped,
        charged_credits: 0,
        refunded_credits: 0,
      };
      return apiSuccess(empty);
    }

    const { ownerId, ownerType } = ctx.billing;
    if (!bypass) {
      await ensureTrialCredits(ownerId, ownerType);
      const check = await checkCredits(ownerId, ownerType, total);
      if (!check.ok) {
        return apiError(
          "insufficient_credits",
          `Das Guthaben reicht nicht: Der Scan von ${count} ${count === 1 ? "Akte" : "Akten"} kostet ${total} Credits, verfügbar sind ${check.balance}. Bitte Credits nachkaufen oder weniger Akten wählen.`,
          402,
          { balance: check.balance, required: total }
        );
      }
    }

    // Book each matter before its run starts; a refused booking ends the scan
    // there (those matters are skipped, not charged).
    const scanId = `scan-${randomUUID()}`;
    const booked: string[] = [];
    const skipped: CaseScanSkipped[] = [...selection.skipped];
    for (const c of selection.cases) {
      if (bypass) {
        booked.push(c.case_slug);
        continue;
      }
      const booking = await recordCreditConsumption(
        ctx,
        "case_scan",
        c.case_slug,
        undefined,
        caseScanBookingKey(scanId, c.case_slug)
      );
      if (!booking.ok) {
        skipped.push({ case_slug: c.case_slug, reason: "insufficient_credits" });
        continue;
      }
      booked.push(c.case_slug);
    }
    if (booked.length === 0) {
      return apiError(
        "insufficient_credits",
        "Das Guthaben reicht nicht für den Akten-Scan. Bitte Credits nachkaufen.",
        402
      );
    }

    const refund = async (slugs: string[]): Promise<number> => {
      if (bypass) return 0;
      let refunded = 0;
      for (const slug of slugs) {
        const r = await refundConsumptionBooking(
          ownerId,
          ownerType,
          caseScanBookingKey(scanId, slug)
        ).catch((err: unknown) => {
          log.warn(
            `[case-scanner] refund failed: ${err instanceof Error ? err.message : String(err)}`
          );
          return { refunded: 0 };
        });
        refunded += r.refunded;
      }
      return refunded;
    };

    let started: {
      launched: Array<{ case_slug: string; job_id: number }>;
      failed: CaseScanSkipped[];
      skipped: CaseScanSkipped[];
    };
    try {
      started = await callEngine(ctx, "/api/legal/case-scanner", {
        method: "POST",
        body: {
          mode: "start",
          scope: "selection",
          case_slugs: booked,
          scan_id: scanId,
          look_ahead_days: body.look_ahead_days ?? 7,
          evidence_threshold: body.evidence_threshold ?? 1,
          limit: CASE_SCAN_MAX_CASES,
        },
      });
    } catch (e) {
      log.warn(`[case-scanner] start failed: ${e instanceof Error ? e.message : String(e)}`);
      await refund(booked);
      return engineFailure();
    }

    const launchedSlugs = new Set(started.launched.map((l) => l.case_slug));
    const notStarted = booked.filter((s) => !launchedSlugs.has(s));
    const refunded = await refund(notStarted);
    const engineSkipped = new Set(started.skipped.map((s) => s.case_slug));
    const failed: CaseScanSkipped[] = [
      ...started.failed,
      ...notStarted
        .filter((s) => !engineSkipped.has(s) && !started.failed.some((f) => f.case_slug === s))
        .map((s) => ({ case_slug: s, reason: "not_started" })),
    ];

    const result: CaseScanStartResult = {
      scan_id: scanId,
      launched: started.launched,
      failed,
      skipped: [...skipped, ...started.skipped],
      charged_credits: bypass ? 0 : caseScanCost(started.launched.length),
      refunded_credits: refunded,
    };
    return apiSuccess(result);
  }
);

export const GET = createHandler(
  {
    action: "legal.case_scanner",
    rateTier: "standard",
    query: statusSchema,
  },
  async (ctx, _body, query) => {
    let data: { runs: Array<{ job_id: number; case_slug: string; status: string }> };
    try {
      data = await callEngine(
        ctx,
        `/api/legal/case-scanner/runs?scan_id=${encodeURIComponent(query.scan_id)}`,
        { method: "GET" }
      );
    } catch (e) {
      log.warn(`[case-scanner] status failed: ${e instanceof Error ? e.message : String(e)}`);
      return engineFailure();
    }
    const bypass = billingBypassed(ctx);
    const runs: CaseScanStatus["runs"] = [];
    for (const run of data.runs) {
      let refunded = false;
      if (CASE_SCAN_FAILED_STATES.has(run.status) && !bypass && run.case_slug) {
        // Idempotent per matter: a repeated status call refunds nothing more.
        await refundConsumptionBooking(
          ctx.billing.ownerId,
          ctx.billing.ownerType,
          caseScanBookingKey(query.scan_id, run.case_slug)
        ).catch((err: unknown) =>
          log.warn(
            `[case-scanner] refund failed: ${err instanceof Error ? err.message : String(err)}`
          )
        );
        refunded = true;
      }
      runs.push({ ...run, refunded });
    }
    const result: CaseScanStatus = { scan_id: query.scan_id, runs };
    return apiSuccess(result);
  }
);
