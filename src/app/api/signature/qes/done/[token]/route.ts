import { NextRequest, NextResponse } from "next/server";
import { ENGINE_URL, enginePatchPage, engineHeadersForBrain } from "@/lib/engine";
import { logAudit } from "@/lib/audit";
import { appendDocumentsToMatter, uploadFileToMatter } from "@/lib/email/mail-filing";
import {
  QES_METHOD_LABEL,
  certificateSubjectName,
  isTrustedPdfUrl,
  readQesCheck,
  sha256Hex,
  withOrigDigest,
  signedFilename,
} from "@/lib/qes/pdf-as";
import { appBase, pdfAsBase } from "@/lib/qes/config";
import { getQesSession, updateQesSession } from "@/lib/qes/sessions";
import { clientIp, hit } from "@/lib/auth/rate-limit";
import { logger } from "@/lib/logger";

const log = logger("api/signature/qes/done");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function backToMatter(caseSlug: string, params: Record<string, string>): NextResponse {
  const url = new URL(
    `${appBase()}/dashboard/cases/${caseSlug.split("/").map(encodeURIComponent).join("/")}/documents`
  );
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

/**
 * PDF-AS-WEB sends the signer here after a successful signature
 * (invoke-app-url?pdfurl=…&pdflength=…). The signed PDF is fetched once from
 * the configured PDF-AS host, bound to the original by origdigest, checked,
 * and stored as a new document of the matter.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  // No user session on this callback — the token is the credential; cap guessing.
  const limited = await hit(`qes:done:${clientIp(req.headers)}`, 30, 60_000);
  if (!limited.ok) return new Response("Too many requests", { status: 429 });
  const { token } = await context.params;
  const session = await getQesSession(token);
  if (!session)
    return new Response("Signaturvorgang nicht gefunden oder abgelaufen.", { status: 404 });
  if (session.status === "signed") return backToMatter(session.caseSlug, { qes: "signed" });

  const base = pdfAsBase();
  const pdfUrl = req.nextUrl.searchParams.get("pdfurl");
  const fail = async (error: string) => {
    await updateQesSession(token, { status: "failed", error });
    void logAudit("signature.qes_failed", "document", {
      entityId: session.documentSlug,
      brainId: session.brainId,
      userId: session.userId,
      userEmail: session.userEmail,
      details: { method: session.method, error },
    });
    return backToMatter(session.caseSlug, { qes: "failed", reason: error });
  };

  if (!base || !isTrustedPdfUrl(pdfUrl, base))
    return fail("Unerwartete Rückmeldung des Signaturdienstes.");
  if (!session.originalDigest)
    return fail("Das Dokument wurde vom Signaturdienst nicht abgerufen.");

  let signed: Buffer;
  let check: ReturnType<typeof readQesCheck>;
  try {
    const res = await fetch(withOrigDigest(pdfUrl as string, base, session.originalDigest), {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return fail("Das signierte Dokument konnte nicht abgeholt werden.");
    signed = Buffer.from(await res.arrayBuffer());
    check = readQesCheck(res.headers);
  } catch (err) {
    log.error("signed PDF fetch failed", err instanceof Error ? err.message : String(err));
    return fail("Das signierte Dokument konnte nicht abgeholt werden.");
  }
  if (!signed.subarray(0, 5).toString("latin1").startsWith("%PDF")) {
    return fail("Der Signaturdienst hat kein PDF geliefert.");
  }
  if (!check.valueOk) return fail("Die Signaturprüfung ist fehlgeschlagen.");

  const signer = certificateSubjectName(check.signerCertificate);
  const entry = await uploadFileToMatter(
    session.brainId,
    session.caseSlug,
    {
      filename: signedFilename(session.title),
      contentType: "application/pdf",
      size: signed.byteLength,
      content: signed,
    },
    "qes"
  );
  if (!entry?.slug) return fail("Das signierte Dokument konnte nicht gespeichert werden.");
  const signedSlug = entry.slug;
  await appendDocumentsToMatter(session.brainId, session.caseSlug, [entry]);

  const headers = engineHeadersForBrain(session.brainId);
  const now = new Date().toISOString();
  // The signed PDF is stored at this point; the two evidence writes below
  // must not be reported as done when the engine refused them.
  const metadataStored = await enginePatchPage(
    headers,
    {
      slug: signedSlug,
      frontmatter: {
        signature_level: "qualified",
        signature_method: session.method,
        signed_at: now,
        signed_by: signer ?? session.userEmail,
        signed_from_document: session.documentSlug,
        signature_value_check: check.valueCheckCode,
        signature_certificate_check: check.certificateCheckCode,
        signed_sha256: sha256Hex(signed),
      },
    },
    { timeoutMs: 15_000 }
  )
    .then((res) => res.ok)
    .catch(() => false);
  const evidenceStored = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: `legal/signatures/qes/${token.slice(0, 16)}`,
      title: `Qualifizierte Signatur: ${session.title}`,
      type: "captured_signature",
      frontmatter: {
        legal_level: "qualified",
        signature_format: "qes_pdf_as",
        method: session.method,
        method_label: QES_METHOD_LABEL[session.method],
        document_slug: session.documentSlug,
        signed_document_slug: signedSlug,
        case_slug: session.caseSlug,
        signer_name: signer,
        started_by: session.userEmail,
        captured_at: now,
        original_sha256: session.originalDigest,
        signed_sha256: sha256Hex(signed),
        value_check_code: check.valueCheckCode,
        certificate_check_code: check.certificateCheckCode,
      },
    }),
    signal: AbortSignal.timeout(10_000),
  })
    .then((res) => res.ok)
    .catch(() => false);
  const evidenceComplete = metadataStored && evidenceStored;
  if (!evidenceComplete) {
    log.error("signature evidence not stored", {
      signedDocument: signedSlug,
      metadataStored,
      evidenceStored,
    });
  }

  await updateQesSession(token, { status: "signed", signedDocumentSlug: signedSlug });
  void logAudit("signature.qes_signed", "document", {
    entityId: session.documentSlug,
    brainId: session.brainId,
    userId: session.userId,
    userEmail: session.userEmail,
    details: {
      method: session.method,
      signedDocument: signedSlug,
      signer,
      certificateCheck: check.certificateCheckCode,
      evidenceComplete,
    },
  });
  return backToMatter(
    session.caseSlug,
    evidenceComplete
      ? { qes: "signed" }
      : {
          qes: "signed",
          reason:
            "Der Signaturnachweis konnte nicht vollständig gespeichert werden. Bitte den Support informieren.",
        }
  );
}
