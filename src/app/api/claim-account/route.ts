import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import {
  createClaim,
  allocatePayment,
  applyPaymentToClaim,
  createInstallmentPlan,
  applyInstallmentPayment,
  buildMahnAntrag,
  buildExekutionsantrag,
  createZvMeasure,
  transitionToVollstreckungsbescheid,
  transitionToZwangsvollstreckung,
  paymentRecord,
  type Claim,
  type ZvMeasure,
  type AntragsDaten,
} from "@/lib/claim-account";
import { GUARD_READ_FAILED, readCurrentPage, rejectionResponse } from "@/lib/page-write-guards";
import { withKeyedLock } from "@/lib/keyed-lock";
import { firmToday } from "@/lib/datetime";
import { formatEur } from "@/lib/utils";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  case_slug: z.string().min(1).max(300),
  claimant_name: z.string().min(1).max(300),
  debtor_name: z.string().min(1).max(300),
  debtor_address: z.string().max(500).optional(),
  principal_amount: z.number().min(0),
  interest_amount: z.number().min(0).optional(),
  costs_amount: z.number().min(0).optional(),
  interest_rate: z.number().min(0).optional(),
  interest_from: z.string().min(1),
  due_date: z.string().min(1),
  court: z.string().max(300).optional(),
  claim_number: z.string().max(300).optional(),
  jurisdiction: z.enum(["at", "de"]).optional(),
});

async function persistClaim(
  ctx: { headers: Record<string, string> },
  claim: Claim,
  opts: { create?: boolean } = {}
) {
  const res = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { ...ctx.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: `legal/claims/${claim.id}`,
      title: `Forderung: ${claim.debtor_name} — ${formatEur(claim.total_claim, "de")}`,
      type: "claim_account",
      frontmatter: claim,
      // Changes are merged onto the stored claim (read under the lock);
      // a new claim is written create-only.
      ...(opts.create ? { if_absent: true } : { merge: true }),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`engine write failed: ${res.status}`);
}

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: createSchema,
    audit: (ctx, body) => ({
      action: "case.create" as const,
      entityType: "claim_account",
      entityId: body.case_slug,
      details: { principal: body.principal_amount, debtor: body.debtor_name },
    }),
  },
  async (ctx, body) => {
    const claim = createClaim({ ...body, jurisdiction: body.jurisdiction ?? "at" });
    await persistClaim(ctx, claim, { create: true });
    return apiSuccess({ claim });
  }
);

const zvTypeEnum = z.enum([
  "pfändung_und_überweisung",
  "pfändung_immobilien",
  "pfändung_forderungen",
  "zwangsversteigerung",
  "zwangsverwaltung",
  "eidesstattliche_versicherung",
]);

const zvMeasureSchema = z.object({
  type: zvTypeEnum,
  target: z.string().min(1).max(500),
  court: z.string().max(300).optional(),
  costs: z.number().min(0).optional(),
});

const installmentSchema = z.object({
  index: z.number().int().min(0),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().min(0),
  paid_amount: z.number().min(0),
  status: z.enum(["offen", "teilbezahlt", "bezahlt", "überfällig"]),
});

const zvRecordSchema = z.object({
  id: z.string().min(1).max(100),
  claim_id: z.string().min(1).max(100),
  type: zvTypeEnum,
  target: z.string().min(1).max(500),
  court: z.string().max(300),
  date: z.string(),
  status: z.enum(["beantragt", "angeordnet", "durchgeführt", "aufgehoben", "erfolglos"]),
  result: z.string().max(1000).optional(),
  amount_recovered: z.number().min(0).optional(),
  costs: z.number().min(0),
  created_at: z.string(),
});

const antragSchema = z.object({
  art: z.enum(["mahnklage", "mahnbescheid", "exekution"]),
  jurisdiction: z.enum(["at", "de"]),
  gericht: z.string().max(300),
  antragsteller: z.object({ name: z.string().max(300), rolle: z.string().max(100) }),
  gegner: z.object({
    name: z.string().max(300),
    adresse: z.string().max(500).optional(),
  }),
  forderung: z.object({
    hauptforderung: z.number(),
    zinsen: z.number(),
    zinsen_prozent: z.number(),
    zinsen_laufend_ab: z.string(),
    kosten: z.number(),
    gesamt: z.number(),
    offen: z.number(),
  }),
  rechtsgrundlage: z.string().max(500),
  hinweise: z.array(z.string().max(500)).max(20),
  antragstext: z.string().max(20_000),
});

/**
 * A claim action names the claim by id. The stored claim is the only source
 * of balances and status: whatever a (possibly stale) client sends as
 * `claim` is ignored except for its id.
 */
const patchSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9._-]+$/)
      .optional(),
    /** Legacy clients send the whole claim — only its id is read. */
    claim: z
      .object({ id: z.string().min(1).max(100) })
      .passthrough()
      .optional(),
    /** Optimistic check: refuse when the claim changed since the client read it. */
    expected_updated_at: z.string().max(40).optional(),
    action: z
      .enum(["payment", "mahnklage", "vollstreckung", "exekution", "ratenplan", "rate"])
      .optional(),
    payment_amount: z.number().min(0.01).optional(),
    /** Day the money arrived (default: today in the firm's calendar). */
    payment_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    gericht: z.string().max(300).optional(),
    titel: z.string().max(300).optional(),
    measure: zvMeasureSchema.optional(),
    installments: z.number().int().min(2).max(60).optional(),
    start_iso: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    grace_days: z.number().int().min(0).max(90).optional(),
    jurisdiction: z.enum(["at", "de"]).optional(),
  })
  .refine((b) => b.id || b.claim?.id, { message: "id required" })
  .refine((b) => b.action || b.payment_amount !== undefined, {
    message: "action or payment_amount required",
  });

const CLAIM_ID = /^[A-Za-z0-9._-]+$/;

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: patchSchema,
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "claim_payment",
      entityId: body.id ?? body.claim?.id ?? "unknown",
      details: { action: body.action ?? "payment", payment: body.payment_amount },
    }),
  },
  async (ctx, body) => {
    const id = String(body.id ?? body.claim?.id ?? "");
    if (!CLAIM_ID.test(id)) return apiError("invalid_claim_id", "Ungültige Forderung", 400);
    // One change at a time per claim: two payments booked together both count.
    return withKeyedLock(`claim:${ctx.brainId}:${id}`, () => applyClaimAction(ctx, id, body));
  }
);

type PatchBody = z.infer<typeof patchSchema>;

async function applyClaimAction(
  ctx: { headers: Record<string, string>; user: { email?: string; id: string } },
  id: string,
  body: PatchBody
): Promise<Response> {
  const read = await readCurrentPage(ENGINE_URL, ctx.headers, `legal/claims/${id}`);
  if (read.kind === "error") return rejectionResponse(GUARD_READ_FAILED);
  if (read.kind === "missing") return apiError("not_found", "Forderung nicht gefunden", 404);
  const claim = read.page.frontmatter as unknown as Claim;
  if (!claim || claim.id !== id) return apiError("not_found", "Forderung nicht gefunden", 404);
  if (body.expected_updated_at && body.expected_updated_at !== claim.updated_at) {
    return apiError(
      "version_conflict",
      "Die Forderung wurde zwischenzeitlich geändert. Bitte neu laden.",
      409
    );
  }
  const jurisdiction = body.jurisdiction ?? claim.jurisdiction ?? "at";
  const action = body.action ?? "payment";
  const bookedBy = ctx.user.email ?? ctx.user.id;
  const paymentDate = body.payment_date ?? firmToday();

  if (action === "payment") {
    if (!body.payment_amount)
      return apiError("payment_amount_required", "Zahlungsbetrag erforderlich", 400);
    if (claim.status === "paid" || claim.status === "written_off") {
      return apiError("claim_closed", "Die Forderung ist bereits erledigt.", 409);
    }
    const allocation = allocatePayment(claim, body.payment_amount);
    const updated: Claim = {
      ...applyPaymentToClaim(claim, allocation),
      payments: [
        ...(claim.payments ?? []),
        paymentRecord(allocation, { date: paymentDate, bookedBy }),
      ],
    };
    await persistClaim(ctx, updated);
    return apiSuccess({ claim: updated, allocation });
  }

  if (action === "mahnklage") {
    if (!body.gericht) return apiError("gericht_required", "Gericht erforderlich", 400);
    if (claim.status !== "open")
      return apiError("invalid_status_transition", "Statusübergang nicht zulässig", 409);
    const antrag: AntragsDaten = buildMahnAntrag(claim, {
      jurisdiction,
      gericht: body.gericht,
    });
    const updated: Claim = {
      ...claim,
      status: "mahnbescheid",
      mahnbescheid_date: new Date().toISOString(),
      jurisdiction,
      last_antrag: antrag,
      updated_at: new Date().toISOString(),
    };
    await persistClaim(ctx, updated);
    return apiSuccess({ claim: updated, antrag });
  }

  if (action === "vollstreckung") {
    if (claim.status !== "mahnbescheid")
      return apiError("invalid_status_transition", "Statusübergang nicht zulässig", 409);
    const updated = transitionToVollstreckungsbescheid(claim);
    await persistClaim(ctx, updated);
    return apiSuccess({ claim: updated });
  }

  if (action === "exekution") {
    if (!body.gericht || !body.titel || !body.measure)
      return apiError(
        "gericht_titel_measure_required",
        "Gericht, Titel und Maßnahme erforderlich",
        400
      );
    if (claim.status !== "vollstreckungsbescheid")
      return apiError("invalid_status_transition", "Statusübergang nicht zulässig", 409);
    const measure: ZvMeasure = createZvMeasure({
      claim_id: claim.id,
      type: body.measure.type,
      target: body.measure.target,
      court: body.gericht,
      costs: body.measure.costs,
    });
    const antrag: AntragsDaten = buildExekutionsantrag(claim, measure, {
      jurisdiction,
      gericht: body.gericht,
      titel: body.titel,
    });
    const updated: Claim = {
      ...transitionToZwangsvollstreckung(claim),
      zv_measures: [...(claim.zv_measures ?? []), measure],
      last_antrag: antrag,
    };
    await persistClaim(ctx, updated);
    return apiSuccess({ claim: updated, antrag, measure });
  }

  if (action === "ratenplan") {
    if (!body.installments || !body.start_iso)
      return apiError(
        "installments_start_required",
        "Ratenanzahl und Startdatum erforderlich",
        400
      );
    const plan = createInstallmentPlan(claim, {
      count: body.installments,
      startIso: body.start_iso,
      graceDays: body.grace_days,
    });
    const updated: Claim = {
      ...claim,
      installment_plan: plan,
      updated_at: new Date().toISOString(),
    };
    await persistClaim(ctx, updated);
    return apiSuccess({ claim: updated, plan });
  }

  // action === "rate"
  if (!claim.installment_plan)
    return apiError("no_installment_plan", "Kein Ratenplan vorhanden", 400);
  if (!body.payment_amount)
    return apiError("payment_amount_required", "Zahlungsbetrag erforderlich", 400);
  const { plan, applied } = applyInstallmentPayment(claim.installment_plan, body.payment_amount);
  const allocation = allocatePayment(claim, applied);
  const updated: Claim = {
    ...applyPaymentToClaim(claim, allocation),
    installment_plan: plan,
    payments: [
      ...(claim.payments ?? []),
      paymentRecord(allocation, { date: paymentDate, bookedBy, installment: true }),
    ],
  };
  await persistClaim(ctx, updated);
  return apiSuccess({ claim: updated, plan, applied });
}

const listQuerySchema = z.object({
  case_slug: z.string().max(300).optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: listQuerySchema,
  },
  async (ctx, _body, query) => {
    const q = query as { case_slug?: string } | undefined;
    let pages;
    try {
      pages = await listEnginePages(ctx.headers, "claim_account", 10_000, { strict: true });
    } catch {
      return apiError("service_unavailable", "Forderungen derzeit nicht verfügbar", 503);
    }
    // case_slug filtering happens on frontmatter — the engine's /api/pages
    // endpoint never supported a case_slug param (it was silently ignored).
    const claims = pages
      .map((p) => p.frontmatter as unknown as Claim)
      .filter((c) => c && (!q?.case_slug || c.case_slug === q.case_slug));
    return apiSuccess({ claims });
  }
);
