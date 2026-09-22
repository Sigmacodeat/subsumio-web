import { describe, it, expect, vi, afterEach } from "vitest";
import { pollEInvoiceStatus, sendEInvoice, transportAvailability } from "./transport";

const ENV_KEYS = [
  "EINVOICE_PEPPOL_URL",
  "EINVOICE_PEPPOL_TOKEN",
  "EINVOICE_ERV_URL",
  "EINVOICE_ERV_TOKEN",
] as const;

const savedEnv = new Map<string, string | undefined>();
for (const k of ENV_KEYS) savedEnv.set(k, process.env[k]);

function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

afterEach(() => {
  for (const k of ENV_KEYS) {
    const v = savedEnv.get(k);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.unstubAllGlobals();
});

describe("transportAvailability", () => {
  it("reports both channels unconfigured without env", () => {
    clearEnv();
    expect(transportAvailability()).toEqual({ peppol: false, erechnung_gv_at: false });
  });
});

describe("sendEInvoice", () => {
  it("returns honest not_configured without env (never simulates)", async () => {
    clearEnv();
    const r = await sendEInvoice("peppol", "<xml/>", {
      invoiceNumber: "R-1",
      format: "xrechnung",
    });
    expect(r.status).toBe("not_configured");
    expect(r.message).toContain("EINVOICE_PEPPOL");
  });

  it("e-Rechnung.gv.at rejects non-ebInterface formats", async () => {
    process.env.EINVOICE_ERV_URL = "https://erv.example/api";
    process.env.EINVOICE_ERV_TOKEN = "t";
    const r = await sendEInvoice("erechnung_gv_at", "<xml/>", {
      invoiceNumber: "R-2",
      format: "xrechnung",
    });
    expect(r.status).toBe("failed");
    expect(r.message).toContain("ebInterface");
  });
});

describe("pollEInvoiceStatus", () => {
  it("returns not_configured without env", async () => {
    clearEnv();
    const r = await pollEInvoiceStatus("peppol", "ref-1");
    expect(r.status).toBe("not_configured");
  });

  it("maps delivered status from the access point", async () => {
    process.env.EINVOICE_PEPPOL_URL = "https://ap.example/peppol/";
    process.env.EINVOICE_PEPPOL_TOKEN = "tok";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ status: "delivered" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await pollEInvoiceStatus("peppol", "ref-42");
    expect(r.status).toBe("delivered");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ap.example/peppol/status?reference=ref-42",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    );
  });

  it("maps unknown status to queued", async () => {
    process.env.EINVOICE_PEPPOL_URL = "https://ap.example";
    process.env.EINVOICE_PEPPOL_TOKEN = "tok";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ status: "in_transit" }), { status: 200 }))
    );
    const r = await pollEInvoiceStatus("peppol", "ref-9");
    expect(r.status).toBe("queued");
  });

  it("reports failed on transport error", async () => {
    process.env.EINVOICE_PEPPOL_URL = "https://ap.example";
    process.env.EINVOICE_PEPPOL_TOKEN = "tok";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    const r = await pollEInvoiceStatus("peppol", "ref-x");
    expect(r.status).toBe("failed");
    expect(r.message).toContain("timeout");
  });
});
