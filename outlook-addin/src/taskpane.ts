/* Outlook Add-in Task Pane — separater Build (office-js Types bei Bedarf installieren)
   npm install -g office-toolbox && npm run build

   Features:
   1. Mail-Import: Aktuelle E-Mail in Subsumio-Akte importieren (via /api/email-import)
   2. Brain-Query: Frage an das Brain stellen (via /api/think)
*/

import {
  clearStoredSession,
  msUntilRenewal,
  openSignInDialog,
  readStoredSession,
  safeSessionStorage,
  storeSession,
  type AddinSession,
} from "./addin-auth";
import { createThinkStreamParser } from "./think-stream";

interface CaseSuggestion {
  slug: string;
  caseNumber?: string;
  title: string;
}

interface AttachmentMeta {
  id: string;
  name: string;
  size: number;
  contentType: string;
  isInline: boolean;
}

const API_BASE = "https://subsum.io";
/** Short-lived add-in token from the sign-in dialog — memory + sessionStorage only. */
let session: AddinSession | null = null;
let renewTimer: ReturnType<typeof setTimeout> | undefined;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let currentMode: "conservative" | "balanced" | "tokenmax" = "balanced";
let currentMail: { subject: string; from: string; body: string; date?: string } | null = null;
let currentAttachments: AttachmentMeta[] = [];
/** Zuletzt erfolgreich gematchte Akte — wird im Anhang-Select vorausgewählt. */
let lastCaseSlug = "";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Office: any;

function showStatus(msg: string, type: "ok" | "err" | "info") {
  const el = document.getElementById("status")!;
  el.textContent = msg;
  el.className = `status ${type}`;
  el.style.display = "block";
}

function hideStatus() {
  document.getElementById("status")!.style.display = "none";
}

// ── KI-Kennzeichnung + Fundstellenprüfung ───────────────────────────
// Mirrors src/lib/ai-act.ts (the add-in build cannot import from the web app;
// scripts/check-grounding-invariant.ts fails when the texts drift apart).
const AI_NOTICE =
  "KI-generierter Entwurf — anwaltlich zu prüfen und freizugeben (EU AI Act Art. 50). Erstellt mit Subsumio.";
const AI_BADGE_LABEL = "KI-generiert · Anwaltlich zu prüfen";

/** Response of POST /api/legal/ground (src/lib/citation-gate-client.ts GroundingMetadata). */
interface GroundingResult {
  citations_verified: number;
  citations_unverified: number;
  corpus_checked?: boolean;
  has_unverified?: boolean;
  warning?: string;
  grounded_citations?: Array<{ code: string; paragraph: string; verified: boolean }>;
}

function groundingHtml(g: GroundingResult): string {
  const unverified = (g.grounded_citations ?? [])
    .filter((c) => !c.verified)
    .slice(0, 6)
    .map((c) => escapeHtml(`${c.paragraph} ${c.code}`.trim()));
  const counts =
    g.citations_verified + g.citations_unverified === 0
      ? "Keine Normzitate erkannt."
      : `${g.citations_verified} Zitat(e) im Korpus bestätigt · ${g.citations_unverified} nicht bestätigt`;
  return `<div style="margin-top:4px;color:${g.citations_unverified > 0 ? "#ef9a9a" : "#9ad0a0"}">${counts}</div>${
    unverified.length > 0
      ? `<div style="color:#ef9a9a">Nicht bestätigt: ${unverified.join(" · ")}</div>`
      : ""
  }${g.warning ? `<div style="color:#e0b341">${escapeHtml(g.warning)}</div>` : ""}`;
}

function hideAiNotice(noticeId: string) {
  const el = document.getElementById(noticeId);
  if (!el) return;
  el.innerHTML = "";
  el.style.display = "none";
}

/**
 * Grounding invariant (CLAUDE.md): an AI answer is shown with the AI label and,
 * once visible, its citations are checked against the corpus via
 * /api/legal/ground (non-blocking). A failed check says so instead of passing
 * the answer off as verified.
 */
async function showAiNoticeAndGround(
  noticeId: string,
  answer: string,
  serverGrounding?: GroundingResult
): Promise<void> {
  const el = document.getElementById(noticeId);
  if (!el) return;
  el.innerHTML = `<div style="font-weight:700;color:#e0b341">${AI_BADGE_LABEL}</div><div style="color:#e0b341">${AI_NOTICE}</div>`;
  el.style.display = "block";
  const text = answer.trim();
  if (text.length < 10) return;
  const slot = document.createElement("div");
  slot.style.cssText = "margin-top:4px;color:#9a9ab8";
  el.appendChild(slot);
  // The server already checked this answer's citations — show that result
  // instead of checking the same text a second time.
  if (serverGrounding) {
    slot.innerHTML = groundingHtml(serverGrounding);
    return;
  }
  slot.textContent = "Fundstellen werden geprüft…";
  try {
    const res = await apiFetch("/api/legal/ground", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 50_000) }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    slot.innerHTML = groundingHtml((await res.json()) as GroundingResult);
  } catch {
    slot.textContent = "Fundstellenprüfung nicht verfügbar — Zitate bitte manuell prüfen.";
  }
}

/** Plain-text AI notice that travels with a draft into the reply window. */
function withAiNotice(draft: string): string {
  return `${draft.trim()}\n\n— ${AI_BADGE_LABEL}: ${AI_NOTICE}`;
}

/**
 * Every API call authenticates with the add-in token only: cookies of a web
 * session on the same origin are never sent (they would bypass the token and
 * trip the browser CSRF check). A 401 ends the session in the pane.
 */
async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!session) throw new Error("Nicht angemeldet — bitte zuerst anmelden.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.token}`);
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: "omit" });
  if (res.status === 401) {
    endSession("Ihr Add-in-Zugang ist abgelaufen oder wurde widerrufen. Bitte erneut anmelden.");
  }
  return res;
}

function setButtonBusy(id: string, busy: boolean, label: string, busyLabel: string) {
  const btn = document.getElementById(id) as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = busy;
  if (busy) btn.innerHTML = `<div class="spinner"></div> ${busyLabel}`;
  else btn.textContent = label;
}

/** Sign in through the Office dialog (normal web sign-in incl. 2FA). */
async function signIn() {
  setButtonBusy("signInBtn", true, "Anmelden", "Anmeldung läuft…");
  try {
    const next = await openSignInDialog(Office, { apiBase: API_BASE, client: "outlook" });
    await startSession(next);
  } catch (e) {
    showStatus(e instanceof Error ? e.message : "Anmeldung fehlgeschlagen.", "err");
  } finally {
    setButtonBusy("signInBtn", false, "Anmelden", "");
  }
}

/** Fallback for Outlook versions without the dialog: a pasted add-in token. */
async function connect() {
  const input = document.getElementById("token") as HTMLInputElement;
  const value = input.value.trim();
  input.value = "";
  // Only short-lived add-in tokens (24 h, revocable) — never a permanent API key.
  if (!value.startsWith("sk_addin_")) {
    showStatus(
      "Bitte einen Add-in-Zugang verwenden (beginnt mit „sk_addin_“) oder „Anmelden“ nutzen.",
      "err"
    );
    return;
  }
  setButtonBusy("connectBtn", true, "Verbinden", "Wird verbunden…");
  try {
    // A pasted token lives at most 24 hours; the server enforces the real expiry.
    await startSession({ token: value, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  } catch (e) {
    showStatus(e instanceof Error ? e.message : "Verbindung fehlgeschlagen.", "err");
  } finally {
    setButtonBusy("connectBtn", false, "Verbinden", "");
  }
}

async function startSession(next: AddinSession) {
  session = next;
  try {
    const res = await apiFetch("/api/brains");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    endSession(null);
    throw e;
  }
  storeSession(safeSessionStorage(), next);
  scheduleRenewal(next);
  showStatus("Verbunden.", "ok");
  document.getElementById("mainSection")!.style.display = "block";
  document.getElementById("authSection")!.style.display = "none";
  document.getElementById("connectedSection")!.style.display = "flex";
  loadCurrentMail();
}

/** Ask for a new sign-in shortly before the token expires; sign out at expiry. */
function scheduleRenewal(current: AddinSession) {
  clearTimeout(renewTimer);
  clearTimeout(expiryTimer);
  const notice = document.getElementById("sessionNotice");
  if (notice) notice.style.display = "none";
  renewTimer = setTimeout(() => {
    if (notice) notice.style.display = "block";
  }, msUntilRenewal(current));
  expiryTimer = setTimeout(
    () => endSession("Ihr Add-in-Zugang ist abgelaufen. Bitte erneut anmelden."),
    Math.max(0, current.expiresAt - Date.now())
  );
}

/** Ends the session in this pane (memory, sessionStorage, timers, UI). */
function endSession(message: string | null) {
  session = null;
  clearTimeout(renewTimer);
  clearTimeout(expiryTimer);
  clearStoredSession(safeSessionStorage());
  const notice = document.getElementById("sessionNotice");
  if (notice) notice.style.display = "none";
  document.getElementById("mainSection")!.style.display = "none";
  document.getElementById("authSection")!.style.display = "block";
  document.getElementById("connectedSection")!.style.display = "none";
  if (message) showStatus(message, "err");
}

/** Sign out: revoke this add-in's token on the server, then forget it. */
async function disconnect() {
  let revoked = false;
  try {
    const res = await apiFetch("/api/addin-token", { method: "DELETE" });
    revoked = res.ok;
  } catch {
    revoked = false;
  }
  endSession(null);
  if (revoked) {
    showStatus("Abgemeldet — der Zugang dieses Add-ins wurde widerrufen.", "info");
  } else {
    showStatus(
      "Lokal abgemeldet. Der Zugang konnte nicht widerrufen werden; bitte in Subsumio widerrufen.",
      "err"
    );
  }
}

async function loadCurrentMail() {
  try {
    const item = Office.context.mailbox.item;

    // The add-in works on received mails (read mode). In compose mode the
    // fields are async objects, not values — refuse instead of importing
    // "[object Object]".
    if (typeof item.subject !== "string" && item.subject !== undefined) {
      showStatus("Subsumio ist für empfangene E-Mails verfügbar, nicht beim Verfassen.", "err");
      return;
    }
    const subject = item.subject || "(Kein Betreff)";
    // No invented sender: without one the import is blocked (see importMail).
    const from: string = item.from?.emailAddress || item.sender?.emailAddress || "";
    const date = item.dateTimeCreated ? new Date(item.dateTimeCreated).toISOString() : undefined;

    currentMail = { subject, from, body: "", date };

    document.getElementById("mailSubject")!.textContent = subject;
    document.getElementById("mailFrom")!.textContent = from || "(Absender unbekannt)";

    // WP-4.21: Anhänge der geöffneten Mail auflisten (Read-Mode liefert
    // Metadaten; Inhalt erst bei Bedarf via getAttachmentContentAsync).
    const rawAtts = Array.isArray(item.attachments) ? item.attachments : [];
    currentAttachments = rawAtts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((a: any) => ({
        id: String(a.id ?? ""),
        name: String(a.name ?? "Anhang"),
        size: typeof a.size === "number" ? a.size : 0,
        contentType: String(a.contentType ?? "application/octet-stream"),
        isInline: Boolean(a.isInline),
      }))
      .filter((a: AttachmentMeta) => a.id && !a.isInline);
    renderAttachmentList();
    loadAttachCases();

    if (item.body) {
      item.body.getAsync("text", (asyncResult: { status: string; value: string }) => {
        if (asyncResult.status === "succeeded") {
          currentMail!.body = asyncResult.value;
          document.getElementById("mailBody")!.textContent =
            asyncResult.value.substring(0, 500) + (asyncResult.value.length > 500 ? "…" : "");
        } else {
          currentMail!.body = "(Text konnte nicht geladen werden)";
          document.getElementById("mailBody")!.textContent = currentMail!.body;
        }
      });
    } else {
      currentMail.body = "(Kein Text verfügbar)";
      document.getElementById("mailBody")!.textContent = currentMail.body;
    }
  } catch {
    showStatus("E-Mail konnte nicht geladen werden.", "err");
  }
}

async function importMail() {
  if (!currentMail) {
    showStatus("Keine E-Mail geladen.", "err");
    return;
  }
  if (!currentMail.from) {
    showStatus(
      "Der Absender dieser E-Mail ist nicht bekannt — Import nicht möglich. Bitte die E-Mail manuell ablegen.",
      "err"
    );
    return;
  }

  const btn = document.getElementById("importBtn") as HTMLButtonElement;
  const btnText = document.getElementById("importBtnText")!;
  btn.disabled = true;
  btnText.innerHTML = '<div class="spinner"></div> Importiere…';

  try {
    const res = await apiFetch("/api/email-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: currentMail.subject,
        from: currentMail.from,
        body: currentMail.body,
        date: currentMail.date,
      }),
    });

    const data = await res.json();

    if (data.success && data.matchedCase) {
      lastCaseSlug = data.matchedCase.slug;
      const sel = document.getElementById("attachCaseSelect") as HTMLSelectElement | null;
      if (sel && [...sel.options].some((o) => o.value === lastCaseSlug)) sel.value = lastCaseSlug;
      if (data.duplicate) {
        showStatus(`E-Mail bereits in Akte „${data.matchedCase.title}" vorhanden.`, "info");
      } else {
        showStatus(`E-Mail in Akte „${data.matchedCase.title}" importiert.`, "ok");
      }
    } else if (data.error === "no_case_match" && data.suggestions) {
      showStatus("Keine passende Akte gefunden. Bitte wählen Sie manuell:", "info");
      renderCaseSuggestions(data.suggestions as CaseSuggestion[]);
    } else {
      showStatus(data.message || "Import fehlgeschlagen.", "err");
    }
  } catch (e) {
    showStatus(e instanceof Error ? e.message : "Import fehlgeschlagen.", "err");
  } finally {
    btn.disabled = false;
    btnText.textContent = "In Akte importieren";
  }
}

function renderCaseSuggestions(suggestions: CaseSuggestion[]) {
  const list = document.getElementById("caseList")!;
  list.innerHTML = "";
  suggestions.forEach((c) => {
    const item = document.createElement("div");
    item.className = "case-item";
    item.innerHTML = `<div class="title">${escapeHtml(c.title)}</div><div class="meta">${escapeHtml(c.caseNumber || c.slug)}</div>`;
    item.onclick = () => importToSpecificCase(c.slug);
    list.appendChild(item);
  });
  document.getElementById("caseMatchSection")!.style.display = "block";
}

async function importToSpecificCase(slug: string) {
  if (!currentMail) return;
  if (!currentMail.from) {
    showStatus("Der Absender dieser E-Mail ist nicht bekannt — Import nicht möglich.", "err");
    return;
  }

  showStatus("Importiere in ausgewählte Akte…", "info");

  try {
    const res = await apiFetch("/api/email-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: currentMail.subject,
        from: currentMail.from,
        body: currentMail.body,
        date: currentMail.date,
        caseSlug: slug,
      }),
    });

    const data = await res.json();
    if (data.success) {
      lastCaseSlug = slug;
      const sel = document.getElementById("attachCaseSelect") as HTMLSelectElement | null;
      if (sel && [...sel.options].some((o) => o.value === lastCaseSlug)) sel.value = lastCaseSlug;
      showStatus(`E-Mail in Akte importiert.`, "ok");
      document.getElementById("caseMatchSection")!.style.display = "none";
    } else {
      showStatus(data.message || "Import fehlgeschlagen.", "err");
    }
  } catch (e) {
    showStatus(e instanceof Error ? e.message : "Import fehlgeschlagen.", "err");
  }
}

async function runQuery() {
  const input = document.getElementById("queryInput") as HTMLTextAreaElement;
  const query = input.value.trim();
  if (!query) {
    showStatus("Bitte eine Frage eingeben.", "err");
    return;
  }

  const btn = document.getElementById("queryBtn") as HTMLButtonElement;
  const btnText = document.getElementById("queryBtnText")!;
  btn.disabled = true;
  btnText.innerHTML = '<div class="spinner"></div> Abfrage…';

  const resultEl = document.getElementById("queryResult")!;
  resultEl.style.display = "block";
  resultEl.textContent = "Abfrage läuft…";
  hideAiNotice("queryNotice");

  try {
    const res = await apiFetch("/api/think", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, mode: currentMode }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const contentType = res.headers.get("Content-Type") || "";
    if (contentType.includes("text/event-stream") && res.body) {
      // Engine stream: {chunk} text, {final_answer} replaces the draft after
      // verification, {grounding} is the server's citation check, [DONE] ends.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parser = createThinkStreamParser();
      while (!parser.state.done) {
        const { done, value } = await reader.read();
        if (done) break;
        if (parser.push(decoder.decode(value, { stream: true }))) {
          resultEl.textContent = parser.state.answer;
        }
      }
      if (parser.end()) resultEl.textContent = parser.state.answer;
      await reader.cancel().catch(() => {});
      const { answer, grounding, error } = parser.state;
      if (error && !answer) throw new Error(error);
      if (!answer) resultEl.textContent = "(Leere Antwort)";
      else {
        resultEl.textContent = answer;
        void showAiNoticeAndGround("queryNotice", answer, grounding);
      }
    } else {
      // JSON answer ({answer} or {data:{answer}}) — never show the raw JSON.
      const raw = await res.text();
      let text = raw;
      try {
        const j = JSON.parse(raw) as { answer?: unknown; data?: { answer?: unknown } };
        const a = j.answer ?? j.data?.answer;
        if (typeof a === "string") text = a;
      } catch {
        /* plain text */
      }
      resultEl.textContent = text;
      if (text.trim()) void showAiNoticeAndGround("queryNotice", text);
    }

    hideStatus();
  } catch (e) {
    showStatus(e instanceof Error ? e.message : "Abfrage fehlgeschlagen.", "err");
    resultEl.style.display = "none";
    hideAiNotice("queryNotice");
  } finally {
    btn.disabled = false;
    btnText.textContent = "Abfragen";
  }
}

/** Last generated reply draft, kept for the "Als Antwort öffnen" action. */
let currentDraft = "";

async function draftReply() {
  if (!currentMail) {
    showStatus("Keine E-Mail geladen.", "err");
    return;
  }
  if (!currentMail.body || currentMail.body.length < 10) {
    showStatus("E-Mail-Text wird noch geladen — bitte kurz warten.", "info");
    return;
  }

  const btn = document.getElementById("draftReplyBtn") as HTMLButtonElement;
  const btnText = document.getElementById("draftReplyBtnText")!;
  const resultEl = document.getElementById("draftResult")!;
  const summaryEl = document.getElementById("draftSummary")!;
  const insertBtn = document.getElementById("insertReplyBtn")!;
  btn.disabled = true;
  insertBtn.style.display = "none";
  summaryEl.style.display = "none";
  summaryEl.textContent = "";
  currentDraft = "";
  hideAiNotice("draftNotice");
  btnText.innerHTML = '<div class="spinner"></div> Entwurf wird erstellt…';
  resultEl.style.display = "block";
  resultEl.textContent = "Der Assistent liest die E-Mail und entwirft eine Antwort…";

  try {
    const res = await apiFetch("/api/email/draft-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: currentMail.subject,
        from: currentMail.from,
        body: currentMail.body,
        ...(lastCaseSlug ? { caseSlug: lastCaseSlug } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    const draft = (data.draft ?? data.data?.draft ?? "") as string;
    if (!res.ok || !draft) {
      resultEl.style.display = "none";
      showStatus(data.message || `Entwurf fehlgeschlagen (HTTP ${res.status}).`, "err");
      return;
    }
    const summary = (data.summary ?? data.data?.summary ?? "") as string;
    if (summary) {
      summaryEl.textContent = `📋 ${summary}`;
      summaryEl.style.display = "block";
      summaryEl.style.cssText =
        "display:block;font-size:11px;color:#8a8aa8;border-left:2px solid #6d6dfb;padding:4px 8px;margin:6px 0;line-height:1.4";
    }
    currentDraft = draft;
    resultEl.textContent = draft;
    void showAiNoticeAndGround("draftNotice", draft);
    insertBtn.style.display = "flex";
    showStatus("Entwurf bereit — bitte anwaltlich prüfen, bevor Sie antworten.", "info");
  } catch (e) {
    resultEl.style.display = "none";
    showStatus(e instanceof Error ? e.message : "Entwurf fehlgeschlagen.", "err");
  } finally {
    btn.disabled = false;
    btnText.textContent = "Antwort entwerfen";
  }
}

/** Open a prefilled Outlook reply window with the draft (read mode). */
function insertDraftAsReply() {
  if (!currentDraft) return;
  try {
    // The AI notice travels into the reply: the lawyer removes it only after
    // reviewing the text (EU AI Act Art. 50 transparency).
    const htmlBody = `<p>${escapeHtml(withAiNotice(currentDraft))
      .split("\n")
      .filter((l) => l.trim())
      .join("<br/>")}</p>`;
    Office.context.mailbox.item.displayReplyAllForm({ htmlBody });
  } catch {
    showStatus(
      "Antwortfenster konnte nicht geöffnet werden. Der Entwurf steht oben zum Kopieren bereit.",
      "err"
    );
  }
}

// ── WP-4.21: Anhänge in Akte ablegen ────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function renderAttachmentList() {
  const list = document.getElementById("attachmentList")!;
  list.innerHTML = "";
  if (currentAttachments.length === 0) {
    const empty = document.createElement("div");
    empty.className = "attach-empty";
    empty.textContent = "Diese E-Mail enthält keine Anhänge.";
    list.appendChild(empty);
    return;
  }
  currentAttachments.forEach((att, i) => {
    const row = document.createElement("label");
    row.className = "attach-item";
    row.innerHTML =
      `<input type="checkbox" data-att-idx="${i}" checked />` +
      `<span class="attach-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>` +
      `<span class="attach-size">${formatSize(att.size)}</span>` +
      `<span class="attach-state" data-att-state="${i}"></span>`;
    list.appendChild(row);
  });
}

async function loadAttachCases() {
  const sel = document.getElementById("attachCaseSelect") as HTMLSelectElement | null;
  if (!sel) return;
  try {
    const res = await apiFetch("/api/pages?type=legal_case&limit=200");
    if (!res.ok) return;
    const raw = (await res.json()) as unknown;
    const pages = (
      Array.isArray(raw) ? raw : ((raw as { items?: unknown[] }).items ?? [])
    ) as Array<{
      slug: string;
      title: string;
      frontmatter?: { case_number?: string };
    }>;
    sel.innerHTML = "";
    for (const p of pages) {
      const opt = document.createElement("option");
      opt.value = p.slug;
      opt.textContent = p.frontmatter?.case_number
        ? `${p.frontmatter.case_number} — ${p.title}`
        : p.title;
      sel.appendChild(opt);
    }
    if (lastCaseSlug && pages.some((p) => p.slug === lastCaseSlug)) sel.value = lastCaseSlug;
  } catch {
    // Akte-Liste bleibt leer — der Upload meldet dann „keine Akte gewählt".
  }
}

/** Office.js-Callback in ein Promise wandeln; liefert den Anhang als Blob. */
function getAttachmentBlob(att: AttachmentMeta): Promise<Blob> {
  return new Promise((resolve, reject) => {
    Office.context.mailbox.item.getAttachmentContentAsync(
      att.id,
      (asyncResult: {
        status: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        value?: any;
        error?: { message?: string };
      }) => {
        if (asyncResult.status !== "succeeded" || !asyncResult.value) {
          reject(new Error(asyncResult.error?.message ?? "Anhang konnte nicht gelesen werden."));
          return;
        }
        const v = asyncResult.value;
        // base64-Attachments → Blob; .eml-Anhänge kommen als String.
        if (v.format === "base64" && typeof v.content === "string") {
          const bin = atob(v.content);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          resolve(new Blob([bytes], { type: att.contentType }));
        } else if (typeof v.content === "string") {
          resolve(new Blob([v.content], { type: "message/rfc822" }));
        } else {
          reject(new Error("Anhang-Format wird nicht unterstützt."));
        }
      }
    );
  });
}

async function fileAttachments() {
  const sel = document.getElementById("attachCaseSelect") as HTMLSelectElement;
  const caseSlug = sel?.value ?? "";
  if (!caseSlug) {
    showStatus("Bitte zuerst eine Ziel-Akte auswählen.", "err");
    return;
  }
  const checked = Array.from(
    document.querySelectorAll<HTMLInputElement>("#attachmentList input[type=checkbox]:checked")
  );
  if (checked.length === 0) {
    showStatus("Keine Anhänge ausgewählt.", "err");
    return;
  }

  const btn = document.getElementById("attachBtn") as HTMLButtonElement;
  const btnText = document.getElementById("attachBtnText")!;
  btn.disabled = true;
  btnText.innerHTML = '<div class="spinner"></div> Lege ab…';

  let ok = 0;
  let failed = 0;
  for (const box of checked) {
    const idx = Number(box.dataset.attIdx);
    const att = currentAttachments[idx];
    const stateEl = document.querySelector(`[data-att-state="${idx}"]`);
    if (!att) continue;
    if (stateEl) stateEl.textContent = "⏳";
    try {
      const blob = await getAttachmentBlob(att);
      const fd = new FormData();
      fd.append("file", new File([blob], att.name, { type: att.contentType }));
      fd.append("case_slug", caseSlug);
      fd.append("source", "legal_case");
      const res = await apiFetch("/api/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ok++;
      if (stateEl) stateEl.textContent = "✓";
    } catch {
      failed++;
      if (stateEl) stateEl.textContent = "✗";
    }
  }

  btn.disabled = false;
  btnText.textContent = "In Akte ablegen";
  if (failed === 0) {
    showStatus(`${ok} ${ok === 1 ? "Anhang wurde" : "Anhänge wurden"} in der Akte abgelegt.`, "ok");
  } else {
    showStatus(`${ok} abgelegt, ${failed} fehlgeschlagen — bitte erneut versuchen.`, "err");
  }
}

function switchTab(tab: string) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
  document.querySelector(`.tab[data-tab="${tab}"]`)?.classList.add("active");
  document.getElementById(`tab-${tab}`)?.classList.add("active");
}

function setMode(mode: "conservative" | "balanced" | "tokenmax") {
  currentMode = mode;
  document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
  document.querySelector(`.mode-btn[data-mode="${mode}"]`)?.classList.add("active");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Wire every handler via addEventListener instead of inline onclick=""
 * attributes. This is what lets taskpane.html ship a CSP with no
 * 'unsafe-inline' in script-src — a defense for the add-in token held while
 * the taskpane is open: a strict script-src means an injected <script>
 * or onerror= payload can't execute even if it lands in the DOM somewhere,
 * since no inline JS runs.
 */
function wireUpHandlers() {
  document.getElementById("signInBtn")?.addEventListener("click", signIn);
  document.getElementById("renewBtn")?.addEventListener("click", signIn);
  document.getElementById("connectBtn")?.addEventListener("click", connect);
  document.getElementById("disconnectBtn")?.addEventListener("click", disconnect);
  document.getElementById("importBtn")?.addEventListener("click", importMail);
  document.getElementById("queryBtn")?.addEventListener("click", runQuery);
  document.getElementById("draftReplyBtn")?.addEventListener("click", draftReply);
  document.getElementById("insertReplyBtn")?.addEventListener("click", insertDraftAsReply);
  document.getElementById("attachBtn")?.addEventListener("click", fileAttachments);

  document.querySelectorAll<HTMLElement>(".tab").forEach((el) => {
    el.addEventListener("click", () => {
      const tab = el.dataset.tab;
      if (tab) switchTab(tab);
    });
  });

  document.querySelectorAll<HTMLElement>(".mode-btn").forEach((el) => {
    el.addEventListener("click", () => {
      const mode = el.dataset.mode as "conservative" | "balanced" | "tokenmax" | undefined;
      if (mode) setMode(mode);
    });
  });
}

// Office initialization
Office.onReady(() => {
  wireUpHandlers();
  // Reopened pane in the same Office session: continue while the token is valid.
  const storage = safeSessionStorage();
  const stored = readStoredSession(storage);
  if (stored) {
    void startSession(stored).catch(() => undefined);
  } else {
    clearStoredSession(storage);
  }
});
