// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// docusign.ts pulls in the auth store; the smoke test never touches it.
vi.mock("@/lib/auth/store", () => ({ getStore: () => ({}), getSharedPgPool: () => null }));

type Smoke = typeof import("./post-deploy-smoke");

const ALL_VARS = [
  "RESEND_API_KEY",
  "MAIL_FROM",
  "SUBSUMIO_INTERNAL_URL",
  "PORT",
  "CRON_SECRET",
  "PORTAL_TOKEN_SECRET",
  "SUBSUMIO_STORAGE_ENCRYPTION_KEY",
  "SUBSUMIO_STORAGE_ENCRYPTION_KEY_ID",
  "SUBSUMIO_STORAGE_ENCRYPTION_RETIRED_KEYS",
  "MISTRAL_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENROUTER_API_KEY_FALLBACK",
  "OPENROUTER_BASE_URL",
  "ANTHROPIC_API_KEY",
  "MS365_CLIENT_ID",
  "MS365_CLIENT_SECRET",
  "MS365_TENANT_ID",
  "MS365_MAILBOX",
  "MS365_OUTLOOK_FOLDER",
  "DOCUSIGN_INTEGRATION_KEY",
  "DOCUSIGN_SECRET_KEY",
  "DOCUSIGN_ACCOUNT_ID",
  "DOCUSIGN_BASE_URL",
  "DOCUSIGN_OAUTH_HOST",
  "FCM_SERVICE_ACCOUNT_PATH",
  "STRIPE_SECRET_KEY",
  "DMS_ALLOWED_BRAIN_IDS",
  "DMS_PROVIDER",
  "DMS_BASE_URL",
];

const SECRETS = {
  RESEND_API_KEY: "re_TESTSECRET_resend_0123456789",
  CRON_SECRET: "cron-TESTSECRET-0123456789abcdef0123456789",
  PORTAL_TOKEN_SECRET: "portal-TESTSECRET-0123456789abcdef012345678",
  SUBSUMIO_STORAGE_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  MISTRAL_API_KEY: "mistral-TESTSECRET-0123456789",
  OPENROUTER_API_KEY: "sk-or-TESTSECRET-0123456789",
  ANTHROPIC_API_KEY: "sk-ant-TESTSECRET-0123456789",
  MS365_CLIENT_SECRET: "graph-TESTSECRET-0123456789",
  DOCUSIGN_SECRET_KEY: "docusign-TESTSECRET-0123456789",
  STRIPE_SECRET_KEY: "sk_test_TESTSECRET_0123456789",
};

function setEnv(vars: Record<string, string>): void {
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/** fetch stub routed by URL prefix; records every call. */
function routeFetch(routes: Array<[prefix: string, handler: (c: Call) => Response]>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
      const call: Call = {
        url,
        method: (init?.method ?? "GET").toUpperCase(),
        headers,
        body: init?.body ? String(init.body) : undefined,
      };
      calls.push(call);
      const hit = routes.find(([p]) => url.startsWith(p));
      if (!hit) throw new Error(`unexpected fetch ${url}`);
      return hit[1](call);
    })
  );
  return calls;
}

let smoke: Smoke;

beforeEach(async () => {
  for (const name of ALL_VARS) vi.stubEnv(name, "");
  vi.resetModules();
  smoke = await import("./post-deploy-smoke");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("error summaries never echo response text", () => {
  it("extracts only machine codes", () => {
    expect(smoke.providerErrorCode({ name: "restricted_api_key", message: "x" })).toBe(
      "restricted_api_key"
    );
    expect(smoke.providerErrorCode({ error: { type: "authentication_error", message: "m" } })).toBe(
      "authentication_error"
    );
    expect(smoke.providerErrorCode({ error: { code: 401, message: "No auth" } })).toBe("401");
    expect(
      smoke.providerErrorCode({
        error: "invalid_client",
        error_description: "AADSTS7000215: Invalid client secret provided.",
      })
    ).toBe("invalid_client AADSTS7000215");
    expect(smoke.providerErrorCode({ error: "has spaces and a secret" })).toBeNull();
  });

  it("library errors keep status + code, drop the rest", () => {
    const err = new Error(
      `MS365 token request failed: 401 {"error":"invalid_client","error_description":"AADSTS7000215: secret ${SECRETS.MS365_CLIENT_SECRET}"}`
    );
    const cause = smoke.libErrorCause(err);
    expect(cause).toBe(
      "HTTP 401 invalid_client AADSTS7000215 (Schlüssel ungültig oder abgelaufen)"
    );
    expect(cause).not.toContain("TESTSECRET");
    expect(smoke.libErrorCause(new SyntaxError(`Unexpected token in "-----BEGIN PRIVATE`))).toBe(
      "keine gültige JSON-Datei"
    );
    expect(smoke.libErrorCause(new Error(`boom ${SECRETS.CRON_SECRET}`))).toBe(
      "unerwarteter Fehler (Error)"
    );
  });
});

describe("Resend (required)", () => {
  it("missing key is a required failure", async () => {
    const r = await smoke.checkResend(process.env);
    expect(r).toMatchObject({ required: true, configured: false, status: "missing" });
  });

  it("lists domains (GET, nothing sent) and accepts a verified MAIL_FROM domain", async () => {
    setEnv({ RESEND_API_KEY: SECRETS.RESEND_API_KEY, MAIL_FROM: "Kanzlei <post@Mail.Example.at>" });
    const calls = routeFetch([
      [
        "https://api.resend.com/domains",
        () =>
          json(200, {
            object: "list",
            data: [
              { name: "other.example", status: "not_started" },
              { name: "mail.example.at", status: "verified" },
            ],
          }),
      ],
    ]);
    const r = await smoke.checkResend(process.env);
    expect(r).toMatchObject({ status: "ok", detail: "mail.example.at verifiziert" });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].headers.authorization).toBe(`Bearer ${SECRETS.RESEND_API_KEY}`);
  });

  it("an unverified or unknown sender domain fails", async () => {
    setEnv({ RESEND_API_KEY: SECRETS.RESEND_API_KEY, MAIL_FROM: "post@kanzlei.example" });
    routeFetch([
      [
        "https://api.resend.com/domains",
        () => json(200, { data: [{ name: "kanzlei.example", status: "pending" }] }),
      ],
    ]);
    expect(await smoke.checkResend(process.env)).toMatchObject({
      status: "error",
      detail: "kanzlei.example nicht verifiziert (Status pending)",
    });
    vi.unstubAllGlobals();
    routeFetch([["https://api.resend.com/domains", () => json(200, { data: [] })]]);
    expect((await smoke.checkResend(process.env)).detail).toBe(
      "Absenderdomain kanzlei.example nicht im Resend-Konto"
    );
  });

  it("a sending-only key is valid but cannot list domains: warning, not failure", async () => {
    setEnv({ RESEND_API_KEY: SECRETS.RESEND_API_KEY });
    routeFetch([
      [
        "https://api.resend.com/domains",
        () =>
          json(401, {
            name: "restricted_api_key",
            message: "This API key is restricted to only send emails",
          }),
      ],
    ]);
    const r = await smoke.checkResend(process.env);
    expect(r.status).toBe("warn");
    expect(smoke.isFailure(r)).toBe(false);
  });

  it("an invalid key fails with the provider code", async () => {
    setEnv({ RESEND_API_KEY: SECRETS.RESEND_API_KEY });
    routeFetch([
      [
        "https://api.resend.com/domains",
        () => json(401, { name: "invalid_api_key", message: "API key is invalid" }),
      ],
    ]);
    expect(await smoke.checkResend(process.env)).toMatchObject({
      status: "error",
      detail: "HTTP 401 invalid_api_key (Schlüssel ungültig oder abgelaufen)",
    });
  });
});

describe("engine readiness (required)", () => {
  it("asks the app's readiness probe as operator and maps its checks", async () => {
    setEnv({ CRON_SECRET: SECRETS.CRON_SECRET, SUBSUMIO_INTERNAL_URL: "http://localhost:3000/" });
    const calls = routeFetch([
      [
        "http://localhost:3000/api/readiness",
        () =>
          json(503, {
            status: "down",
            checks: {
              engine: { status: "ok", latencyMs: 3 },
              auth: { status: "ok" },
              config: { status: "down", detail: "Missing: PORTAL_TOKEN_SECRET" },
            },
          }),
      ],
    ]);
    const rows = await smoke.checkReadiness(process.env);
    expect(rows.map((r) => r.status)).toEqual(["ok", "ok", "error"]);
    expect(rows[2].detail).toBe("down: Missing: PORTAL_TOKEN_SECRET");
    expect(calls[0].headers.authorization).toBe(`Bearer ${SECRETS.CRON_SECRET}`);
  });

  it("an unreachable app fails all three rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Object.assign(new TypeError("fetch failed"), {
          cause: { code: "ECONNREFUSED" },
        });
      })
    );
    const rows = await smoke.checkReadiness(process.env);
    expect(rows.every((r) => r.status === "error" && r.required)).toBe(true);
    expect(rows[0].detail).toBe("Web-App nicht erreichbar (ECONNREFUSED)");
  });
});

describe("storage encryption key and secrets (required)", () => {
  it("accepts a 32-byte base64 key and never shows it", () => {
    const env = { SUBSUMIO_STORAGE_ENCRYPTION_KEY: SECRETS.SUBSUMIO_STORAGE_ENCRYPTION_KEY };
    const r = smoke.checkStorageKey(env);
    expect(r).toMatchObject({ status: "ok", detail: "aktiver Schlüssel k1, 32 Byte" });
    expect(JSON.stringify(r)).not.toContain(SECRETS.SUBSUMIO_STORAGE_ENCRYPTION_KEY);
  });

  it("rejects a wrong length, bad retired keys and a missing key", () => {
    expect(smoke.checkStorageKey({ SUBSUMIO_STORAGE_ENCRYPTION_KEY: "c2hvcnQ=" }).status).toBe(
      "error"
    );
    const retired = smoke.checkStorageKey({
      SUBSUMIO_STORAGE_ENCRYPTION_KEY: SECRETS.SUBSUMIO_STORAGE_ENCRYPTION_KEY,
      SUBSUMIO_STORAGE_ENCRYPTION_RETIRED_KEYS: "{not json",
    });
    expect(retired.status).toBe("error");
    expect(retired.detail).toContain("RETIRED_KEYS");
    expect(smoke.checkStorageKey({})).toMatchObject({ status: "missing", required: true });
  });

  it("cron/portal secrets: missing fails, short warns", () => {
    expect(smoke.checkSecret({}, "CRON_SECRET", "CRON_SECRET").status).toBe("missing");
    expect(smoke.checkSecret({ CRON_SECRET: "short" }, "CRON_SECRET", "CRON_SECRET").status).toBe(
      "warn"
    );
    expect(
      smoke.checkSecret({ CRON_SECRET: SECRETS.CRON_SECRET }, "CRON_SECRET", "CRON_SECRET").status
    ).toBe("ok");
  });
});

describe("optional AI providers — listing / key info only", () => {
  it("unset providers are skipped without any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await smoke.checkMistral({})).status).toBe("skipped");
    expect((await smoke.checkOpenRouter({}, "OPENROUTER_API_KEY")).status).toBe("skipped");
    expect((await smoke.checkAnthropic({})).status).toBe("skipped");
    expect((await smoke.checkStripe({})).status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Mistral lists models", async () => {
    const calls = routeFetch([
      ["https://api.mistral.ai/v1/models", () => json(200, { object: "list", data: [{}, {}] })],
    ]);
    const r = await smoke.checkMistral({ MISTRAL_API_KEY: SECRETS.MISTRAL_API_KEY });
    expect(r).toMatchObject({ status: "ok", detail: "2 Modelle", required: false });
    expect(calls[0]).toMatchObject({ method: "GET" });
  });

  it("OpenRouter reads key info and flags an exhausted limit", async () => {
    routeFetch([
      [
        "https://openrouter.ai/api/v1/key",
        () =>
          json(200, { data: { limit: 10, limit_remaining: 0, allowed_data_regions: ["europe"] } }),
      ],
    ]);
    const r = await smoke.checkOpenRouter(
      { OPENROUTER_API_KEY: SECRETS.OPENROUTER_API_KEY },
      "OPENROUTER_API_KEY"
    );
    expect(r).toMatchObject({ status: "error", detail: "Schlüssel-Limit aufgebraucht" });
  });

  it("OpenRouter honours OPENROUTER_BASE_URL and shows the data region", async () => {
    const calls = routeFetch([
      [
        "https://eu.openrouter.example/api/v1/key",
        () => json(200, { data: { limit: null, allowed_data_regions: ["europe"] } }),
      ],
    ]);
    const r = await smoke.checkOpenRouter(
      {
        OPENROUTER_API_KEY_FALLBACK: SECRETS.OPENROUTER_API_KEY,
        OPENROUTER_BASE_URL: "https://eu.openrouter.example/api/v1/",
      },
      "OPENROUTER_API_KEY_FALLBACK"
    );
    expect(r).toMatchObject({ status: "ok", detail: "Datenregion europe" });
    expect(calls[0].url).toBe("https://eu.openrouter.example/api/v1/key");
  });

  it("Anthropic lists one model with the versioned header", async () => {
    const calls = routeFetch([
      [
        "https://api.anthropic.com/v1/models",
        () => json(401, { type: "error", error: { type: "authentication_error", message: "x" } }),
      ],
    ]);
    const r = await smoke.checkAnthropic({ ANTHROPIC_API_KEY: SECRETS.ANTHROPIC_API_KEY });
    expect(r.detail).toBe("HTTP 401 authentication_error (Schlüssel ungültig oder abgelaufen)");
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/models?limit=1");
    expect(calls[0].headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("Stripe reads the balance and warns about a test key in production", async () => {
    routeFetch([["https://api.stripe.com/v1/balance", () => json(200, { livemode: false })]]);
    const r = await smoke.checkStripe({
      STRIPE_SECRET_KEY: SECRETS.STRIPE_SECRET_KEY,
      NODE_ENV: "production",
    });
    expect(r).toMatchObject({ status: "warn", detail: "Testmodus-Schlüssel in Produktion" });
  });
});

describe("Microsoft Graph", () => {
  const graphEnv = {
    MS365_CLIENT_ID: "client-id",
    MS365_CLIENT_SECRET: SECRETS.MS365_CLIENT_SECRET,
    MS365_TENANT_ID: "tenant-id",
    MS365_MAILBOX: "kanzlei@example.at",
  };

  it("incomplete configuration names the missing variables", async () => {
    setEnv({ MS365_CLIENT_ID: "client-id" });
    const r = await smoke.checkGraph(process.env);
    expect(r.status).toBe("error");
    expect(r.detail).toContain("MS365_MAILBOX");
  });

  it("fetches an app token, then reads only the folder metadata of the mailbox", async () => {
    setEnv(graphEnv);
    const calls = routeFetch([
      [
        "https://login.microsoftonline.com/",
        () => json(200, { access_token: "graph-access-token", expires_in: 3600 }),
      ],
      [
        "https://graph.microsoft.com/v1.0/users/",
        () => json(200, { id: "f", displayName: "Posteingang", totalItemCount: 3 }),
      ],
    ]);
    const r = await smoke.checkGraph(process.env);
    expect(r).toMatchObject({ status: "ok", detail: "Postfach lesbar (Ordner Posteingang)" });
    expect(calls[0].url).toBe("https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token");
    expect(calls[0].body).toContain("grant_type=client_credentials");
    expect(calls[1].method).toBe("GET");
    expect(calls[1].url).toBe(
      "https://graph.microsoft.com/v1.0/users/kanzlei%40example.at/mailFolders/Inbox?$select=id,displayName,totalItemCount"
    );
  });

  it("a rejected secret is reported with the Entra code, not the response text", async () => {
    setEnv(graphEnv);
    routeFetch([
      [
        "https://login.microsoftonline.com/",
        () =>
          json(401, {
            error: "invalid_client",
            error_description: "AADSTS7000215: Invalid client secret provided.",
          }),
      ],
    ]);
    const r = await smoke.checkGraph(process.env);
    expect(r.detail).toBe(
      "Anmeldung: HTTP 401 invalid_client AADSTS7000215 (Schlüssel ungültig oder abgelaufen)"
    );
  });

  it("missing mail permission on the mailbox fails the check", async () => {
    setEnv(graphEnv);
    routeFetch([
      [
        "https://login.microsoftonline.com/",
        () => json(200, { access_token: "t", expires_in: 3600 }),
      ],
      [
        "https://graph.microsoft.com/",
        () => json(403, { error: { code: "ErrorAccessDenied", message: "Access is denied." } }),
      ],
    ]);
    expect((await smoke.checkGraph(process.env)).detail).toBe(
      "Postfach: HTTP 403 ErrorAccessDenied (keine Berechtigung)"
    );
  });
});

describe("DocuSign (configuration only)", () => {
  const ds = {
    DOCUSIGN_INTEGRATION_KEY: "ik",
    DOCUSIGN_SECRET_KEY: SECRETS.DOCUSIGN_SECRET_KEY,
    DOCUSIGN_ACCOUNT_ID: "acc",
  };

  it("the demo environment in production fails", async () => {
    setEnv({
      ...ds,
      NODE_ENV: "production",
      DOCUSIGN_BASE_URL: "https://demo.docusign.net/restapi/v2.1",
    });
    expect(await smoke.checkDocusign(process.env)).toMatchObject({
      status: "error",
      detail: "DOCUSIGN_BASE_URL zeigt auf die Demo-Umgebung",
    });
  });

  it("a production setup is reported as configured but not probed, without a request", async () => {
    setEnv({
      ...ds,
      NODE_ENV: "production",
      DOCUSIGN_BASE_URL: "https://eu.docusign.net/restapi/v2.1",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await smoke.checkDocusign(process.env);
    expect(r.status).toBe("unchecked");
    expect(r.detail).toContain("Produktionsumgebung");
    expect(smoke.isFailure(r, true)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("FCM", () => {
  const dir = mkdtempSync(join(tmpdir(), "smoke-fcm-"));
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  it("reads the service account and obtains a token without sending a message", async () => {
    const path = join(dir, "ok.json");
    writeFileSync(
      path,
      JSON.stringify({ project_id: "p", client_email: "svc@p.example", private_key: pem })
    );
    setEnv({ FCM_SERVICE_ACCOUNT_PATH: path });
    const calls = routeFetch([
      [
        "https://oauth2.googleapis.com/token",
        () => json(200, { access_token: "a", expires_in: 3600 }),
      ],
    ]);
    expect((await smoke.checkFcm(process.env)).status).toBe("ok");
    expect(calls.map((c) => c.url)).toEqual(["https://oauth2.googleapis.com/token"]);
  });

  it("a broken file never leaks its contents", async () => {
    const path = join(dir, "broken.json");
    writeFileSync(path, `{"private_key": "${pem.slice(0, 80)}`);
    setEnv({ FCM_SERVICE_ACCOUNT_PATH: path });
    const r = await smoke.checkFcm(process.env);
    expect(r).toMatchObject({
      status: "error",
      detail: "Dienstkonto-Datei: keine gültige JSON-Datei",
    });
  });

  it("a rejected token request reports only the status", async () => {
    const path = join(dir, "rejected.json");
    writeFileSync(
      path,
      JSON.stringify({ project_id: "p", client_email: "other@p.example", private_key: pem })
    );
    setEnv({ FCM_SERVICE_ACCOUNT_PATH: path });
    routeFetch([
      ["https://oauth2.googleapis.com/token", () => json(400, { error: "invalid_grant" })],
    ]);
    expect((await smoke.checkFcm(process.env)).detail).toBe(
      "Token: HTTP 400 (unerwartete Antwort)"
    );
  });
});

describe("DMS allow list", () => {
  it("validates the raw format", () => {
    const dms = { DMS_PROVIDER: "netdocuments", DMS_BASE_URL: "https://dms.example" };
    expect(
      smoke.checkDmsAllowList({ ...dms, DMS_ALLOWED_BRAIN_IDS: "org_ab12cd34, brain_1" })
    ).toMatchObject({ status: "ok", detail: "2 Kanzlei(en)" });
    expect(
      smoke.checkDmsAllowList({ ...dms, DMS_ALLOWED_BRAIN_IDS: "org_a,,org a;b,org_a" }).detail
    ).toBe("2 ungültige(r) Eintrag/Einträge, 1 doppelt (Format: id1,id2)");
    expect(smoke.checkDmsAllowList(dms).status).toBe("warn");
    expect(smoke.checkDmsAllowList({}).status).toBe("skipped");
  });
});

describe("full run", () => {
  it("probes everything read-only, prints no secret and passes when all is well", async () => {
    const dir = mkdtempSync(join(tmpdir(), "smoke-all-"));
    const fcmPath = join(dir, "fcm.json");
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    writeFileSync(
      fcmPath,
      JSON.stringify({
        project_id: "p",
        client_email: "svc-all@p.example",
        private_key: rsa.privateKey.export({ type: "pkcs8", format: "pem" }),
      })
    );
    setEnv({
      ...SECRETS,
      NODE_ENV: "production",
      MAIL_FROM: "Subsumio <hello@kanzlei.example>",
      SUBSUMIO_INTERNAL_URL: "http://localhost:3000",
      MS365_CLIENT_ID: "cid",
      MS365_TENANT_ID: "tid",
      MS365_MAILBOX: "box@kanzlei.example",
      DOCUSIGN_INTEGRATION_KEY: "ik",
      DOCUSIGN_ACCOUNT_ID: "acc",
      DOCUSIGN_BASE_URL: "https://eu.docusign.net/restapi/v2.1",
      FCM_SERVICE_ACCOUNT_PATH: fcmPath,
      STRIPE_SECRET_KEY: "sk_live_TESTSECRET_0123456789",
      DMS_PROVIDER: "netdocuments",
      DMS_BASE_URL: "https://dms.example",
      DMS_ALLOWED_BRAIN_IDS: "org_ab12cd34",
    });
    const calls = routeFetch([
      [
        "https://api.resend.com/domains",
        () => json(200, { data: [{ name: "kanzlei.example", status: "verified" }] }),
      ],
      [
        "http://localhost:3000/api/readiness",
        () =>
          json(200, {
            checks: { engine: { status: "ok" }, auth: { status: "ok" }, config: { status: "ok" } },
          }),
      ],
      ["https://api.mistral.ai/", () => json(200, { data: [] })],
      ["https://openrouter.ai/", () => json(200, { data: { limit: null } })],
      ["https://api.anthropic.com/", () => json(200, { data: [] })],
      [
        "https://login.microsoftonline.com/",
        () => json(200, { access_token: "t", expires_in: 3600 }),
      ],
      ["https://graph.microsoft.com/", () => json(200, { displayName: "Inbox" })],
      [
        "https://oauth2.googleapis.com/token",
        () => json(200, { access_token: "a", expires_in: 3600 }),
      ],
      ["https://api.stripe.com/v1/balance", () => json(200, { livemode: true })],
    ]);

    const results = await smoke.runSmoke(process.env);
    const table = smoke.renderTable(results, process.env);

    expect(smoke.exitCode(results, true)).toBe(0);
    expect(results.filter((r) => r.required).every((r) => r.status === "ok")).toBe(true);
    // Side-effect free: only reads, plus the two token exchanges.
    for (const c of calls) {
      if (c.method !== "GET") {
        expect([
          "https://login.microsoftonline.com/tid/oauth2/v2.0/token",
          "https://oauth2.googleapis.com/token",
        ]).toContain(c.url);
      }
    }
    expect(
      calls.some((c) => /\/emails|messages:send|\/chat\/completions|\/messages\b/.test(c.url))
    ).toBe(false);
    expect(table).toContain("Dienst");
    expect(table).toContain("konfiguriert?");
    expect(table).not.toContain("TESTSECRET");
    expect(table).not.toContain(SECRETS.SUBSUMIO_STORAGE_ENCRYPTION_KEY);
  });

  it("scrubs a secret that reached a detail line and sets the exit code", () => {
    const env = { RESEND_API_KEY: SECRETS.RESEND_API_KEY };
    const results = [
      {
        service: "X",
        required: true,
        configured: true,
        status: "error" as const,
        detail: `leak ${SECRETS.RESEND_API_KEY}`,
      },
      { service: "Y", required: false, configured: true, status: "error" as const },
    ];
    const table = smoke.renderTable(results, env);
    expect(table).not.toContain(SECRETS.RESEND_API_KEY);
    expect(table).toContain("[verborgen]");
    expect(smoke.exitCode(results)).toBe(1);
    expect(smoke.exitCode([results[1]])).toBe(0);
    expect(smoke.exitCode([results[1]], true)).toBe(1);
  });
});
