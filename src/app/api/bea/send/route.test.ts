// @vitest-environment node
// beA send: the file_court policy runs on the STORED draft state (fail-closed),
// the sender comes from the firm settings, and without middleware the package
// is marked for manual submission — never "sending".
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));
vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
const settings = { kanzleiName: "Kanzlei Muster & Partner", anwaltName: "" };
vi.mock("@/lib/kanzlei-settings-server", () => ({
  loadKanzleiSettingsForBrain: vi.fn(async () => settings),
}));
vi.mock("@/lib/api-handler", async (orig) => {
  const real = await orig<typeof import("@/lib/api-handler")>();
  return {
    ...real,
    createHandler:
      (
        opts: { body?: { parse: (v: unknown) => unknown } },
        handler: (ctx: unknown, body: unknown) => Promise<Response>
      ) =>
      async (req: Request) =>
        handler(
          {
            brainId: "brain_1",
            headers: { "x-subsumio-source": "brain_1" },
            user: { id: "u1", email: "anwalt@kanzlei.at" },
          },
          opts.body ? opts.body.parse(await req.json()) : undefined
        ),
  };
});

import {
  approveFiling,
  createFilingDocument,
  createFilingPackage,
  submitForApproval,
} from "@/lib/efiling-architecture";

const DRAFT = "legal/bea-drafts/klage-1";
const FILING = "legal/bea-filings/klage-1";
const DRAFT_BODY = "Klage gegen die Gegenseite …";
const DRAFT_HASH = createHash("sha256").update(DRAFT_BODY).digest("hex");

function approvedPkg() {
  const pkg = createFilingPackage({
    case_slug: "cases/a",
    brain_id: "brain_1",
    org_id: "brain_1",
    channel: "beA",
    court: "LG Wien",
    created_by: "anwalt@kanzlei.at",
  });
  pkg.documents.push(
    createFilingDocument({
      title: "Klage",
      file_path: "documents/klage.pdf",
      file_hash: "abc",
      mime_type: "application/pdf",
      size_bytes: 10,
      is_main_document: true,
    })
  );
  return approveFiling(submitForApproval(pkg, "a"), "a");
}

let draftFm: Record<string, unknown>;
let filingFm: Record<string, unknown>;
let writes: Array<Record<string, unknown>>;

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("BEA_MIDDLEWARE_URL", "");
  vi.stubEnv("BEA_MIDDLEWARE_API_KEY", "");
  settings.kanzleiName = "Kanzlei Muster & Partner";
  draftFm = {};
  filingFm = { draft_slug: DRAFT, package: approvedPkg() };
  writes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = decodeURIComponent(String(url));
      if (init?.method === "PATCH" || init?.method === "POST") {
        writes.push(JSON.parse(String(init.body)));
        return new Response("{}", { status: 200 });
      }
      if (u === `http://engine.test/api/pages/${DRAFT}`)
        return new Response(
          JSON.stringify({
            slug: DRAFT,
            title: "Klage",
            compiled_truth: DRAFT_BODY,
            frontmatter: draftFm,
          })
        );
      if (u === `http://engine.test/api/pages/${FILING}`)
        return new Response(JSON.stringify({ slug: FILING, frontmatter: filingFm }));
      return new Response("{}", { status: 404 });
    })
  );
});

function body(extra: Record<string, unknown> = {}) {
  return {
    filing_slug: FILING,
    draft_slug: DRAFT,
    court: "LG Wien",
    subject: "Klage",
    sender_name: "Irgendwer",
    documents: [
      {
        title: "Klage",
        file_path: "documents/klage.pdf",
        mime_type: "application/pdf",
        size_bytes: 10,
        file_hash: "abc",
        is_main_document: true,
      },
    ],
    ...extra,
  };
}

async function send(b: Record<string, unknown>) {
  const { POST } = await import("./route");
  return POST(new Request("http://x", { method: "POST", body: JSON.stringify(b) }) as never);
}

describe("POST /api/bea/send — file_court policy", () => {
  it("refuses a draft stored as BLOCKED even when the client claims VERIFIED", async () => {
    draftFm = { verification_state: "BLOCKED" };
    const res = await send(body({ verification: { state: "VERIFIED", content_hash: DRAFT_HASH } }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe("verification_denied");
    expect(json.details.override_possible).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it("a BLOCKED draft cannot be released by an override either", async () => {
    draftFm = { verification_state: "BLOCKED" };
    const res = await send(
      body({ verification_override: { reason: "Anwaltlich geprüft, passt so." } })
    );
    expect(res.status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it("a draft without a stored state counts as not verified (fail-closed)", async () => {
    const res = await send(body());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.details).toMatchObject({ state: "NEEDS_HUMAN_REVIEW", override_possible: true });
    expect(writes).toHaveLength(0);
  });

  it("an attorney override with a reason releases an unverified draft", async () => {
    const res = await send(
      body({ verification_override: { reason: "Schriftsatz vollständig selbst geprüft." } })
    );
    expect(res.status).toBe(200);
  });

  it("a verified draft whose content changed after the check is refused", async () => {
    draftFm = { verification_state: "VERIFIED", verification_content_hash: "0".repeat(64) };
    const res = await send(body());
    expect(res.status).toBe(403);
  });
});

describe("POST /api/bea/send — sender, court, manual export", () => {
  beforeEach(() => {
    draftFm = { verification_state: "VERIFIED", verification_content_hash: DRAFT_HASH };
  });

  it("without middleware the package is export_manual (not sending) and the sender is the firm", async () => {
    const res = await send(body());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("export_manual");
    expect(json.data.xml).toContain("Kanzlei Muster &amp; Partner");
    expect(json.data.xml).not.toContain("Irgendwer");
    const pkg = (writes.at(-1)?.frontmatter as { package: { status: string } }).package;
    expect(pkg.status).toBe("export_manual");
  });

  it("a placeholder court is refused with 422", async () => {
    const res = await send(body({ court: "—" }));
    expect(res.status).toBe(422);
    expect(writes).toHaveLength(0);
  });

  it("without a firm name in the settings nothing is sent", async () => {
    settings.kanzleiName = "";
    const res = await send(body());
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("sender_missing");
    expect(writes).toHaveLength(0);
  });

  it("a filing package of another draft is refused", async () => {
    filingFm = { ...filingFm, draft_slug: "legal/bea-drafts/other" };
    const res = await send(body());
    expect(res.status).toBe(409);
  });
});

describe("POST /api/bea/send/retry — same gate", () => {
  it("refuses a retry for a BLOCKED draft regardless of the request body", async () => {
    draftFm = { verification_state: "BLOCKED" };
    const { POST } = await import("./retry/route");
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          filing_slug: FILING,
          draft_slug: DRAFT,
          court: "LG Wien",
          subject: "Klage",
          verification: { state: "VERIFIED", content_hash: DRAFT_HASH },
        }),
      }) as never
    );
    expect(res.status).toBe(403);
    expect(writes).toHaveLength(0);
  });
});
