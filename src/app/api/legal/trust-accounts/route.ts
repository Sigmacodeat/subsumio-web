import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";

/** Upper bound for the trust-account list. */
const TRUST_LIST_MAX = 5_000;

export const dynamic = "force-dynamic";

const createSchema = z.object({
  accountName: z.string().min(1),
  accountNumber: z.string().min(1),
  bankName: z.string().optional(),
  iban: z.string().optional(),
  bic: z.string().optional(),
  currency: z.string().default("EUR"),
  openingBalance: z.number().default(0),
  matterSlug: z.string().optional(),
  matterTitle: z.string().optional(),
  clientName: z.string().optional(),
  jurisdiction: z.enum(["at", "de"]).optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: z.object({
      matterSlug: z.string().optional(),
      status: z.enum(["active", "frozen", "closed", "overdrawn"]).optional(),
      limit: z.coerce.number().min(1).max(TRUST_LIST_MAX).optional(),
    }),
  },
  async (ctx, _body, query, _req) => {
    // Every account, paged past the engine's per-request cap; deleted
    // (tombstoned) accounts stay out of the list. The engine cannot filter by
    // frontmatter, so matter/status are filtered here.
    let pages: Array<{ frontmatter?: Record<string, unknown> }>;
    try {
      pages = await listEnginePages(ctx.headers, "trust_account", TRUST_LIST_MAX, {
        strict: true,
      });
    } catch {
      return apiError("engine_error", "Engine request failed", 502);
    }
    const filtered = pages.filter((p) => {
      const fm = p.frontmatter ?? {};
      if (query?.matterSlug && fm.matter_slug !== query.matterSlug) return false;
      if (query?.status && fm.status !== query.status) return false;
      return true;
    });
    return Response.json(query?.limit ? filtered.slice(0, query.limit) : filtered);
  }
);

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: createSchema,
    audit: (ctx) => ({
      action: "case.create" as const,
      entityType: "trust_account",
      details: { by: ctx.user.email },
    }),
  },
  async (ctx, body, _query, _req) => {
    const slug = `trust-accounts/${Date.now()}`;
    const now = new Date().toISOString();

    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        title: body.accountName,
        type: "trust_account",
        content: `Trust account: ${body.accountName}`,
        frontmatter: {
          type: "trust_account",
          jurisdiction: body.jurisdiction ?? ctx.user.jurisdiction ?? "at",
          account_name: body.accountName,
          account_number: body.accountNumber,
          bank_name: body.bankName ?? null,
          iban: body.iban ?? null,
          bic: body.bic ?? null,
          status: "active",
          currency: body.currency,
          // Existing money is booked as a deposit per matter after creation,
          // so no amount on a trust account belongs to no one.
          opening_balance: 0,
          current_balance: 0,
          matter_slug: body.matterSlug ?? null,
          matter_title: body.matterTitle ?? null,
          client_name: body.clientName ?? null,
          transactions: [],
          reconciliations: [],
          created_at: now,
          updated_at: now,
          created_by: ctx.user.email,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return apiError("engine_error", `Failed to create trust account: ${text.slice(0, 200)}`, 502);
    }
    const result = await res.json();
    return Response.json({ slug, ...result }, { status: 201 });
  }
);
