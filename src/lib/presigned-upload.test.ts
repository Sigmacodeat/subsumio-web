// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadFile, uploadFiles } from "./presigned-upload";

class FakeXhr {
  static last: FakeXhr | null = null;
  static respond = { status: 201, body: { slug: "legal/docs/vollmacht", title: "Vollmacht.pdf" } };
  method = "";
  url = "";
  headers: Record<string, string> = {};
  sent: unknown = null;
  status = 0;
  responseText = "";
  upload: { onprogress?: (e: unknown) => void; onload?: () => void } = {};
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  send(body: unknown) {
    this.sent = body;
    FakeXhr.last = this;
    this.status = FakeXhr.respond.status;
    this.responseText = JSON.stringify(FakeXhr.respond.body);
    queueMicrotask(() => this.onload?.());
  }
  abort() {}
}

const file = () => new File(["%PDF-1.4"], "Vollmacht.pdf", { type: "application/pdf" });

describe("presigned upload", () => {
  beforeEach(() => {
    document.cookie = "sb_csrf=abc123";
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    FakeXhr.last = null;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the CSRF header on presign", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: "forbidden", message: "nope" }, { status: 403 })
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadFile(file(), { caseSlug: "legal/cases/berger" })).rejects.toThrow("nope");
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    expect((init.headers as Record<string, string>)["x-csrf-token"]).toBe("abc123");
  });

  it("without object storage the file goes through /api/upload with CSRF and the matter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "no_storage_configured", message: "Storage backend is not configured." },
          { status: 500 }
        )
      )
    );
    const result = await uploadFile(file(), {
      caseSlug: "legal/cases/berger",
      source: "legal_case",
    });
    expect(result.slug).toBe("legal/docs/vollmacht");
    const xhr = FakeXhr.last!;
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("/api/upload");
    expect(xhr.headers["x-csrf-token"]).toBe("abc123");
    const form = xhr.sent as FormData;
    expect(form.get("case_slug")).toBe("legal/cases/berger");
    expect(form.get("source")).toBe("legal_case");
    expect((form.get("file") as File).name).toBe("Vollmacht.pdf");
  });

  it("reports a failed direct upload per file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "no_storage_configured" }, { status: 500 }))
    );
    FakeXhr.respond = {
      status: 409,
      body: { error: "Dokument existiert bereits in dieser Akte" } as never,
    };
    const results = await uploadFiles([file()], { caseSlug: "legal/cases/berger" });
    expect(results[0].error).toBe("Dokument existiert bereits in dieser Akte");
    FakeXhr.respond = {
      status: 201,
      body: { slug: "legal/docs/vollmacht", title: "Vollmacht.pdf" },
    };
  });
});
