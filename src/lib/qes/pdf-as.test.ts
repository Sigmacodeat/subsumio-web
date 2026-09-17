import { describe, expect, it } from "vitest";
import {
  buildSignUrl,
  isTrustedPdfUrl,
  pdfAsBaseUrl,
  readQesCheck,
  withOrigDigest,
} from "@/lib/qes/pdf-as";

const BASE = "https://pdfas.kanzlei.at/pdf-as-web";

describe("PDF-AS-WEB user-agent flow", () => {
  it("builds the Sign request with the documented parameters", () => {
    const url = new URL(
      buildSignUrl({
        base: BASE,
        method: "id_austria",
        pdfUrl: "https://app.subsum.io/api/signature/qes/pdf/tok",
        doneUrl: "https://app.subsum.io/api/signature/qes/done/tok",
        errorUrl: "https://app.subsum.io/api/signature/qes/error/tok",
        filename: "Vollmacht.pdf",
      })
    );
    expect(url.origin + url.pathname).toBe(`${BASE}/Sign`);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      connector: "mobilebku",
      "pdf-url": "https://app.subsum.io/api/signature/qes/pdf/tok",
      "invoke-app-url": "https://app.subsum.io/api/signature/qes/done/tok",
      "invoke-app-error-url": "https://app.subsum.io/api/signature/qes/error/tok",
      locale: "DE",
      filename: "Vollmacht.pdf",
    });
    const card = new URL(
      buildSignUrl({
        base: BASE,
        method: "a_trust_card",
        pdfUrl: "x",
        doneUrl: "y",
        errorUrl: "z",
        filename: "f",
      })
    );
    expect(card.searchParams.get("connector")).toBe("bku");
  });

  it("accepts only https (or local http) as PDF-AS base", () => {
    expect(pdfAsBaseUrl("https://pdfas.kanzlei.at/pdf-as-web/")).toBe(BASE);
    expect(pdfAsBaseUrl("http://evil.example/pdf-as-web")).toBeNull();
    expect(pdfAsBaseUrl("http://localhost:8080/pdf-as-web")).toBe(
      "http://localhost:8080/pdf-as-web"
    );
    expect(pdfAsBaseUrl("")).toBeNull();
  });

  it("fetches the signed PDF only from the configured host, with origdigest", () => {
    expect(isTrustedPdfUrl(`${BASE}/PDFData`, BASE)).toBe(true);
    expect(isTrustedPdfUrl("/pdf-as-web/PDFData", BASE)).toBe(true);
    expect(isTrustedPdfUrl("https://attacker.example/PDFData", BASE)).toBe(false);
    expect(isTrustedPdfUrl("http://pdfas.kanzlei.at/pdf-as-web/PDFData", BASE)).toBe(false);
    expect(withOrigDigest(`${BASE}/PDFData?id=1`, BASE, "ab12")).toBe(
      `${BASE}/PDFData?id=1&origdigest=ab12`
    );
  });

  it("reads the verification headers", () => {
    const ok = readQesCheck(
      new Headers({ ValueCheckCode: "0", CertificateCheckCode: "0", "Signer-Certificate": "MII" })
    );
    expect(ok).toMatchObject({ valueOk: true, certificateOk: true, signerCertificate: "MII" });
    expect(
      readQesCheck(new Headers({ ValueCheckCode: "1", CertificateCheckCode: "4" }))
    ).toMatchObject({ valueOk: false, certificateOk: false });
  });
});

describe("signedFilename", () => {
  it("does not repeat the extension and strips unsafe characters", async () => {
    const { signedFilename } = await import("./pdf-as");
    expect(signedFilename("Vollmacht Berger.PDF")).toBe(
      "Vollmacht Berger (qualifiziert signiert).pdf"
    );
    expect(signedFilename("a/b\\c:d")).toBe("abcd (qualifiziert signiert).pdf");
    expect(signedFilename("")).toBe("Dokument (qualifiziert signiert).pdf");
  });
});
