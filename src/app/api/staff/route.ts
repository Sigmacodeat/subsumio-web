import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { createStaffMember, vacationAccount, StaffInputError, type StaffMember } from "@/lib/staff";
import type { AbsenceRecord } from "@/lib/absence";

export const dynamic = "force-dynamic";

const roleEnum = z.enum(["partner", "anwalt", "assistenz", "rechtsfachwirt", "sonstige"]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO-Datum erwartet");

const createSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(300),
  role: roleEnum.optional(),
  hired_at: isoDate.optional(),
  contract_until: isoDate.optional(),
  vacation_days_per_year: z.number().int().min(0).max(60).optional(),
  vacation_carryover_days: z.number().min(-60).max(200).optional(),
  phone: z.string().max(60).optional(),
  notes: z.string().max(2000).optional(),
});

async function enginePostPage(ctx: { headers: Record<string, string> }, page: unknown) {
  const res = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { ...ctx.headers, "Content-Type": "application/json" },
    body: JSON.stringify(page),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`engine write failed: ${res.status}`);
}

// Personnel files (vacation entitlement, contract dates) are HR records:
// only firm admins create or change them — like other firm settings.
export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: createSchema,
    audit: (_ctx, body) => ({
      action: "settings.update" as const,
      entityType: "staff_member",
      details: { email: body.email, role: body.role },
    }),
  },
  async (ctx, body) => {
    let member: StaffMember;
    try {
      member = createStaffMember(body);
    } catch (err) {
      if (err instanceof StaffInputError) return apiError("invalid_input", err.message, 400);
      throw err;
    }
    try {
      await enginePostPage(ctx, {
        slug: `legal/staff/${member.id}`,
        title: `Mitarbeiter:in: ${member.name}`,
        type: "staff_member",
        frontmatter: member,
      });
    } catch {
      return apiError("engine_write_failed", "Mitarbeiter:in konnte nicht gespeichert werden", 502);
    }
    return apiSuccess({ member });
  }
);

const listQuery = z.object({
  active: z.enum(["true", "false"]).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: listQuery,
  },
  async (ctx, _body, query) => {
    // Cursor-paginated: a bare /api/pages call is capped at 100 rows.
    const [staffPages, absPages] = await Promise.all([
      listEnginePages(ctx.headers, "staff_member", 10_000, { strict: true }).catch(() => null),
      // Strict: a partial absence list would silently corrupt the computed
      // vacation balances (money-adjacent numbers, not just a display list).
      listEnginePages(ctx.headers, "absence_record", 10_000, { strict: true }).catch(() => null),
    ]);
    if (staffPages === null)
      return apiError("engine_error", "Mitarbeiter konnten nicht geladen werden", 502);
    if (absPages === null)
      return apiError("engine_error", "Abwesenheiten konnten nicht geladen werden", 502);

    const absences: AbsenceRecord[] = absPages
      .map((p) => p.frontmatter as AbsenceRecord | undefined)
      .filter((a): a is AbsenceRecord => Boolean(a));

    const year = query?.year ?? new Date().getUTCFullYear();
    let members: StaffMember[] = staffPages
      .map((p) => p.frontmatter as StaffMember | undefined)
      .filter((m): m is StaffMember => Boolean(m));
    if (query?.active === "true") members = members.filter((m) => m.active);
    if (query?.active === "false") members = members.filter((m) => !m.active);

    return apiSuccess({
      members: members.map((m) => ({ ...m, vacation: vacationAccount(m, absences, year) })),
    });
  }
);

const patchSchema = z.object({
  id: z.string().min(1).max(100),
  member: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email().max(300),
    role: roleEnum,
    hired_at: isoDate.optional(),
    contract_until: isoDate.optional(),
    vacation_days_per_year: z.number().int().min(0).max(60),
    vacation_carryover_days: z.number().min(-60).max(200),
    phone: z.string().max(60).optional(),
    notes: z.string().max(2000).optional(),
    active: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
  }),
});

/** Changed fields of a PATCH, before → after, for the audit entry. */
const staffChanges = new WeakMap<object, Record<string, { before: unknown; after: unknown }>>();

const AUDITED_FIELDS = [
  "name",
  "email",
  "role",
  "hired_at",
  "contract_until",
  "vacation_days_per_year",
  "vacation_carryover_days",
  "active",
] as const;

async function engineGetStaff(
  ctx: { headers: Record<string, string> },
  id: string
): Promise<Partial<StaffMember> | null> {
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(`legal/staff/${id}`)}`, {
    headers: ctx.headers,
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const page = (await res.json().catch(() => null)) as { frontmatter?: StaffMember } | null;
  return page?.frontmatter ?? null;
}

export const PATCH = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: patchSchema,
    audit: (_ctx, body) => ({
      action: "settings.update" as const,
      entityType: "staff_member",
      entityId: body.id,
      details: { changes: staffChanges.get(body) ?? null },
    }),
  },
  async (ctx, body) => {
    const before = await engineGetStaff(ctx, body.id);
    const changes: Record<string, { before: unknown; after: unknown }> = {};
    for (const key of AUDITED_FIELDS) {
      const prev = before?.[key] ?? null;
      const next = body.member[key] ?? null;
      if (prev !== next) changes[key] = { before: prev, after: next };
    }
    staffChanges.set(body, changes);

    const member: StaffMember = {
      id: body.id,
      ...body.member,
      updated_at: new Date().toISOString(),
    };
    try {
      await enginePostPage(ctx, {
        slug: `legal/staff/${member.id}`,
        title: `Mitarbeiter:in: ${member.name}`,
        type: "staff_member",
        frontmatter: member,
      });
    } catch {
      return apiError("engine_write_failed", "Änderung konnte nicht gespeichert werden", 502);
    }
    return apiSuccess({ member });
  }
);
