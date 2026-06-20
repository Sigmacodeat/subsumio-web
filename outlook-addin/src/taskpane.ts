/* Outlook Add-in Task Pane — separater Build (office-js Types bei Bedarf installieren)
   npm install -g office-toolbox && npm run build

   Features:
   1. Mail-Import: Aktuelle E-Mail in Subsumio-Akte importieren (via /api/email-import)
   2. Brain-Query: Frage an das Brain stellen (via /api/think)
*/

interface CaseSuggestion {
  slug: string;
  caseNumber?: string;
  title: string;
}

const API_BASE = "https://subsum.eu";
let token = "";
const tokenName = "";
let connected = false;
let currentMode: "conservative" | "balanced" | "tokenmax" = "balanced";
let currentMail: { subject: string; from: string; body: string; date?: string } | null = null;

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

async function connect() {
  const input = document.getElementById("token") as HTMLInputElement;
  token = input.value.trim();
  if (!token) { showStatus("Bitte API-Key eingeben (sk_live_...).", "err"); return; }

  if (!token.startsWith("sk_live_")) {
    showStatus("API-Key muss mit 'sk_live_' beginnen.", "err");
    return;
  }

  const btn = document.getElementById("connectBtn") as HTMLButtonElement;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Verbinde…';

  try {
    const res = await fetch(`${API_BASE}/api/brains`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showStatus("Verbunden.", "ok");
    connected = true;
    localStorage.setItem("subsumio_api_key", token);
    document.getElementById("mainSection")!.style.display = "block";
    document.getElementById("authSection")!.style.display = "none";
    document.getElementById("connectedSection")!.style.display = "flex";
    loadCurrentMail();
  } catch (e) {
    showStatus(e instanceof Error ? e.message : "Verbindung fehlgeschlagen.", "err");
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Verbinden";
  }
}

function disconnect() {
  token = "";
  connected = false;
  localStorage.removeItem("subsumio_api_key");
  document.getElementById("mainSection")!.style.display = "none";
  document.getElementById("authSection")!.style.display = "block";
  document.getElementById("connectedSection")!.style.display = "none";
  (document.getElementById("token") as HTMLInputElement).value = "";
  showStatus("Getrennt.", "info");
}

function tryRestoreSession() {
  const saved = localStorage.getItem("subsumio_api_key");
  if (saved && saved.startsWith("sk_live_")) {
    (document.getElementById("token") as HTMLInputElement).value = saved;
    connect();
  }
}

async function loadCurrentMail() {
  try {
    const item = Office.context.mailbox.item;

    const subject = item.subject || "(Kein Betreff)";
    const from = item.from ? item.from.emailAddress : (item.sender ? item.sender.emailAddress : "unbekannt@absender.de");
    const date = item.dateTimeCreated ? new Date(item.dateTimeCreated).toISOString() : undefined;

    currentMail = { subject, from, body: "", date };

    document.getElementById("mailSubject")!.textContent = subject;
    document.getElementById("mailFrom")!.textContent = from;

    if (item.body) {
      item.body.getAsync("text", (asyncResult: { status: string; value: string }) => {
        if (asyncResult.status === "succeeded") {
          currentMail!.body = asyncResult.value;
          document.getElementById("mailBody")!.textContent = asyncResult.value.substring(0, 500) + (asyncResult.value.length > 500 ? "…" : "");
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
  if (!currentMail) { showStatus("Keine E-Mail geladen.", "err"); return; }

  const btn = document.getElementById("importBtn") as HTMLButtonElement;
  const btnText = document.getElementById("importBtnText")!;
  btn.disabled = true;
  btnText.innerHTML = '<div class="spinner"></div> Importiere…';

  try {
    const res = await fetch(`${API_BASE}/api/email-import`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        subject: currentMail.subject,
        from: currentMail.from,
        body: currentMail.body,
        date: currentMail.date,
      }),
    });

    const data = await res.json();

    if (data.success && data.matchedCase) {
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

  showStatus("Importiere in ausgewählte Akte…", "info");

  try {
    const res = await fetch(`${API_BASE}/api/email-import`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
  if (!query) { showStatus("Bitte eine Frage eingeben.", "err"); return; }

  const btn = document.getElementById("queryBtn") as HTMLButtonElement;
  const btnText = document.getElementById("queryBtnText")!;
  btn.disabled = true;
  btnText.innerHTML = '<div class="spinner"></div> Abfrage…';

  const resultEl = document.getElementById("queryResult")!;
  resultEl.style.display = "block";
  resultEl.textContent = "Abfrage läuft…";

  try {
    const res = await fetch(`${API_BASE}/api/think`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, mode: currentMode }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const contentType = res.headers.get("Content-Type") || "";
    if (contentType.includes("text/event-stream") && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let result = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.content || parsed.text || parsed.delta) {
                result += parsed.content || parsed.text || parsed.delta || "";
                resultEl.textContent = result;
              }
            } catch {
              result += line.slice(6);
              resultEl.textContent = result;
            }
          }
        }
      }
      if (!result) resultEl.textContent = "(Leere Antwort)";
    } else {
      const text = await res.text();
      resultEl.textContent = text;
    }

    hideStatus();
  } catch (e) {
    showStatus(e instanceof Error ? e.message : "Abfrage fehlgeschlagen.", "err");
    resultEl.style.display = "none";
  } finally {
    btn.disabled = false;
    btnText.textContent = "Abfragen";
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
 * 'unsafe-inline' in script-src — the load-bearing defense for the
 * sk_live_ API key held in localStorage (see connect()/tryRestoreSession()):
 * a strict script-src means an injected <script> or onerror= payload can't
 * execute even if it lands in the DOM somewhere, since no inline JS runs.
 */
function wireUpHandlers() {
  document.getElementById("connectBtn")?.addEventListener("click", connect);
  document.getElementById("disconnectBtn")?.addEventListener("click", disconnect);
  document.getElementById("importBtn")?.addEventListener("click", importMail);
  document.getElementById("queryBtn")?.addEventListener("click", runQuery);

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
  tryRestoreSession();
});
