// @vitest-environment node
/**
 * Contract test for the E2E mock engines (R6-1, R6-4): their answers must
 * pass through the SAME product parsers the web app uses against the real
 * engine — otherwise every E2E run tests a mock-only world (e.g. each matter
 * creation with parties ending in 503 because the conflict answer lacks
 * `severity`). Both mocks are started in-process on a random port.
 */
import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({ url: "http://127.0.0.1:0" }));
vi.mock("@/lib/engine", () => ({
  get ENGINE_URL() {
    return engine.url;
  },
}));

import { checkPartiesConflicts, requestConflictCheck } from "@/lib/conflict-gate";
import { listEnginePages } from "@/lib/engine-pages";
import { engineCaseCreateDeps } from "@/lib/safe-case-create";
import { reserveInvoiceEntries } from "@/lib/invoice-billing-lock";
import { createServerBrainClient } from "@/lib/server-brain";
import { mockEngineHandler } from "../../tests/e2e-mock-engine";

// The workflow mock is a loosely typed Bun script outside the typechecked
// tree; load it at runtime only (a literal import would pull it into tsc).
const WORKFLOW_MOCK = "../../tests/e2e-workflow-mock-engine";
const { workflowMockHandler } = (await import(/* @vite-ignore */ WORKFLOW_MOCK)) as {
  workflowMockHandler: RequestListener;
};

const headers = { "x-subsumio-source": "contract-test" };

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${engine.url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe.each([
  ["e2e-mock-engine", mockEngineHandler],
  ["e2e-workflow-mock-engine", workflowMockHandler],
] as const)("%s — engine contract", (_name, handler) => {
  let server: Server;

  beforeAll(async () => {
    server = createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    engine.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // An existing matter where "Contract Gegnerin GmbH" is the opponent.
    const res = await post("/api/pages", {
      slug: "legal/cases/contract-bestand",
      title: "Bestandsakte",
      type: "legal_case",
      frontmatter: {
        type: "legal_case",
        client_name: "Contract Bestandsmandant AG",
        opponent_name: "Contract Gegnerin GmbH",
      },
    });
    expect(res.ok).toBe(true);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("conflict check: the answer passes requestConflictCheck (severity + assessment)", async () => {
    const res = await requestConflictCheck(headers, {
      name: "Contract Gegnerin GmbH",
      side: "client",
    });
    expect(res.severity).toBe("critical");
    expect(res.matches[0]).toMatchObject({
      slug: "legal/cases/contract-bestand",
      role: "opponent",
      assessment: "critical",
    });
  });

  it("conflict check: the client-is-opponent hit blocks; an unknown name passes", async () => {
    const blocked = await checkPartiesConflicts(headers, [
      { name: "Contract Gegnerin GmbH", side: "client", ownContactSlugs: [] },
    ]);
    expect(blocked.blocking).toHaveLength(1);
    const clean = await checkPartiesConflicts(headers, [
      { name: "Völlig Unbekannte OG", side: "client", ownContactSlugs: [] },
    ]);
    expect(clean).toMatchObject({ checked: true, severity: "none", blocking: [] });
  });

  it("conflict check: the matter itself is no hit when updating it", async () => {
    const res = await requestConflictCheck(headers, {
      name: "Contract Gegnerin GmbH",
      side: "opponent",
      selfCaseSlug: "legal/cases/contract-bestand",
    });
    expect(res.matches).toEqual([]);
  });

  it("if_absent: a second create-only write on the same slug → 409 page_exists, page unchanged", async () => {
    const first = await post("/api/pages", {
      slug: "legal/invoices/contract-1",
      title: "Erste",
      type: "invoice",
      frontmatter: { invoice_number: "R-1" },
      if_absent: true,
    });
    expect(first.status).toBe(200);
    const second = await post("/api/pages", {
      slug: "legal/invoices/contract-1",
      title: "Zweite",
      type: "invoice",
      frontmatter: { invoice_number: "R-2" },
      if_absent: true,
    });
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe("page_exists");
    const stored = (await (
      await fetch(`${engine.url}/api/pages/legal/invoices/contract-1`, { headers })
    ).json()) as { title: string; frontmatter: Record<string, unknown> };
    expect(stored.title).toBe("Erste");
    expect(stored.frontmatter.invoice_number).toBe("R-1");
  });

  it("if_absent: safe case creation sees the taken slug as 'exists'", async () => {
    const deps = engineCaseCreateDeps(headers);
    const page = { slug: "legal/cases/contract-neu", title: "Neu", type: "legal_case" };
    expect(await deps.writePage({ ...page, frontmatter: {} } as never)).toEqual({ ok: true });
    expect(await deps.writePage({ ...page, frontmatter: {} } as never)).toEqual({
      ok: false,
      exists: true,
    });
  });

  it("listing: max. 100 rows per request, paged to the end without duplicates", async () => {
    for (let i = 0; i < 130; i++) {
      await post("/api/pages", {
        slug: `contract/notes/n-${i}`,
        title: `Notiz ${i}`,
        type: "contract_note",
        frontmatter: {},
      });
    }
    const first = await fetch(`${engine.url}/api/pages?type=contract_note&limit=500`, {
      headers,
    });
    expect(((await first.json()) as unknown[]).length).toBe(100);
    expect(first.headers.get("x-next-cursor")).toBe("100");
    const all = await listEnginePages(headers, "contract_note", 1000, { strict: true });
    expect(new Set(all.map((p) => p.slug)).size).toBe(130);
  });
});

describe("e2e-mock-engine — atomic array ops (billing reservation)", () => {
  let server: Server;

  beforeAll(async () => {
    server = createServer(mockEngineHandler);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    engine.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("two invoices over the same time entry: the second finds it already billed", async () => {
    await post("/api/pages", {
      slug: "legal/cases/contract-billing",
      title: "Abrechnung",
      type: "legal_case",
      frontmatter: { type: "legal_case", time_entries: [], expenses: [] },
    });
    const brain = createServerBrainClient(headers);
    await brain.appendPageArray("legal/cases/contract-billing", "time_entries", [
      { id: "te-1", minutes: 30, billed: false },
    ]);
    const first = await reserveInvoiceEntries(brain, {
      caseSlug: "legal/cases/contract-billing",
      invoiceNumber: "R-1",
      timeEntryIds: ["te-1"],
      expenseIds: [],
    });
    expect(first.claimed.time).toEqual(["te-1"]);
    const second = await reserveInvoiceEntries(brain, {
      caseSlug: "legal/cases/contract-billing",
      invoiceNumber: "R-2",
      timeEntryIds: ["te-1", "te-missing"],
      expenseIds: [],
    });
    expect(second.alreadyBilled.time).toEqual(["te-1"]);
    expect(second.notFound.time).toEqual(["te-missing"]);
  });
});
