import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { computeBalance } from "@/lib/trust-accounting";

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
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: z.object({
      matterSlug: z.string().optional(),
      status: z.enum(["active", "frozen", "closed", "overdrawn"]).optional(),
      limit: z.coerce.number().min(1).max(200).default(50),
    }),
  },
  async (ctx, _body, query, _req) => {
    const params = new URLSearchParams({
      type: "trust_account",
      limit: String(query?.limit ?? 50),
    });
    if (query?.matterSlug) params.set("matter_slug", query.matterSlug);
    if (query?.status) params.set("status", query.status);

    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    return Response.json(Array.isArray(data) ? data : (data.pages ?? []));
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
          account_name: body.accountName,
          account_number: body.accountNumber,
          bank_name: body.bankName ?? null,
          iban: body.iban ?? null,
          bic: body.bic ?? null,
          status: "active",
          currency: body.currency,
          opening_balance: body.openingBalance,
          current_balance: body.openingBalance,
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
