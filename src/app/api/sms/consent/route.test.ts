// @vitest-environment node

/**
 * SMS consent is per firm: a firm neither sees, overwrites nor revokes the
 * opt-in another firm recorded for the same number and contact reference.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let currentCtx: { brainId: string; user: { email: string; orgId?: string } } = {
  brainId: "brain-a",
  user: { email: "a@firm-a.test", orgId: "org-a" },
};

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));

vi.mock("@/lib/api-handler", () => ({
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  createHandler: (
    _opts: unknown,
    handler: (ctx: unknown, body: unknown, query: unknown) => Promise<unknown>
  ) => {
    return async (req: Request) => {
      const url = new URL(req.url);
      const body = req.method === "POST" ? await req.json() : null;
      return handler(currentCtx, body, Object.fromEntries(url.searchParams));
    };
  },
}));

import { GET, POST } from "./route";
import { __resetSmsConsentStoreForTests } from "@/lib/sms/consent-store";
import { sendGuardedSms } from "@/lib/sms/guarded-send";

const PHONE = "+436641234567";
const asFirmA = () => {
  currentCtx = { brainId: "brain-a", user: { email: "a@firm-a.test", orgId: "org-a" } };
};
const asFirmB = () => {
  currentCtx = { brainId: "brain-b", user: { email: "b@firm-b.test", orgId: "org-b" } };
};

function post(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/sms/consent", {
      method: "POST",
      body: JSON.stringify({ phone: PHONE, subjectType: "client", ...body }),
    }) as never
  ) as Promise<Response>;
}

async function list(): Promise<Array<{ id: string; active: boolean; scopes: string[] }>> {
  const res = (await GET(
    new Request(`http://localhost/api/sms/consent?phone=${encodeURIComponent(PHONE)}`) as never
  )) as Response;
  return (
    (await res.json()) as { consents: Array<{ id: string; active: boolean; scopes: string[] }> }
  ).consents;
}

const send = (brainId: string, orgId: string) =>
  sendGuardedSms({
    to: PHONE,
    brainId,
    orgId,
    scope: "client_reminder",
    body: "x",
    send: async () => ({ ok: true, sid: "SM1" }),
  });

describe("/api/sms/consent per firm", () => {
  beforeEach(() => {
    process.env.SUBSUMIO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "sms-consent-route-"));
    __resetSmsConsentStoreForTests();
    asFirmA();
  });

  test("another firm's grant with the same subjectRef creates its own record", async () => {
    const a = await post({
      subjectRef: "contacts/max",
      scopes: ["client_reminder"],
      proof: { basis: "Vollmacht" },
    });
    expect(a.status).toBe(200);
    const aId = ((await a.json()) as { id: string }).id;

    asFirmB();
    expect(await list()).toEqual([]);
    const b = await post({
      subjectRef: "contacts/max",
      scopes: ["deadline_alert"],
      proof: { basis: "Formular" },
    });
    const bId = ((await b.json()) as { id: string }).id;
    expect(bId).not.toBe(aId);

    asFirmA();
    const own = await list();
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ id: aId, active: true, scopes: ["client_reminder"] });
  });

  test("another firm cannot revoke a firm's consent", async () => {
    await post({ subjectRef: "contacts/max", scopes: ["client_reminder"], proof: { basis: "x" } });
    asFirmB();
    const res = await post({
      subjectRef: "contacts/max",
      scopes: ["client_reminder"],
      proof: {},
      revoke: true,
    });
    expect(res.status).toBe(404);
    asFirmA();
    expect((await list())[0]?.active).toBe(true);
  });

  test("only the recording firm may send on the strength of the consent", async () => {
    await post({ subjectRef: "contacts/max", scopes: ["client_reminder"], proof: { basis: "x" } });
    expect((await send("brain-b", "org-b")).reason).toBe("no_consent");
    expect((await send("brain-a", "org-a")).sent).toBe(true);
  });
});
