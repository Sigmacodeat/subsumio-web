/**
 * Subsumio Word Add-in — Vollständige Taskpane-Implementierung
 * Contract-Draft, Redline, Obligation-Extract, Risk-Analysis, Summarize,
 * Akte-Kontext, Chronologie, Export — direkt in Word.
 */

interface BrainPage {
  slug: string;
  title: string;
  type: string;
  content: string;
  frontmatter?: Record<string, unknown>;
}

interface Obligation {
  type: string;
  party: string;
  text: string;
  deadline?: string;
  risk?: "low" | "medium" | "high";
}

interface RiskFinding {
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  clause?: string;
  recommendation: string;
}

interface AnalysisResult {
  summary?: string;
  text?: string;
  obligations?: Obligation[];
  findings?: RiskFinding[];
  overall_risk?: "low" | "medium" | "high" | "critical";
  markdown?: string;
  count?: number;
  status?: string;
  redlined?: string;
  changes?: string[];
  understanding?: string;
  facts?: string;
}

const API_BASE = "https://subsum.io";
let token = "";

// ── Utils ─────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function showStatus(msg: string, ok: boolean, containerId = "status") {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.textContent = msg;
  el.className = `status ${ok ? "ok" : "err"}`;
  el.style.display = "block";
}

function setLoading(btnId: string, loading: boolean, label: string) {
  const btn = document.getElementById(btnId) as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading ? `<div class="spinner"></div> Wird verarbeitet…` : label;
}

async function getSelectedText(): Promise<string> {
  return new Promise((resolve, reject) => {
    Office.context.document.getSelectedDataAsync(
      Office.CoercionType.Text,
      (result: Office.AsyncResult<string>) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          resolve(result.value || "");
        } else {
          reject(new Error(result.error?.message ?? "Kein Text ausgewählt"));
        }
      }
    );
  });
}

async function insertTextAtCursor(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    Office.context.document.setSelectedDataAsync(
      text,
      { coercionType: Office.CoercionType.Text },
      (result: Office.AsyncResult<void>) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) resolve();
        else reject(new Error(result.error?.message ?? "Einfügen fehlgeschlagen"));
      }
    );
  });
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as Record<
      string,
      string
    >;
    throw new Error(err.error ?? err.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// ── Tab Navigation ────────────────────────────────────────────────────

function switchTab(tab: string) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    (panel as HTMLElement).style.display =
      panel.getAttribute("data-panel") === tab ? "block" : "none";
  });
}

// ── Auth ──────────────────────────────────────────────────────────────

async function connect() {
  const input = document.getElementById("token") as HTMLInputElement;
  token = input.value.trim();
  if (!token) {
    showStatus("Bitte API-Token eingeben.", false);
    return;
  }
  setLoading("connectBtn", true, "Verbinden");
  try {
    await apiGet<unknown>("/api/pages?limit=1");
    showStatus("Erfolgreich verbunden.", true);
    document.getElementById("mainContent")!.style.display = "block";
    document.getElementById("authSection")!.style.display = "none";
    await loadRecentCases();
  } catch (e) {
    showStatus(e instanceof Error ? e.message : "Verbindung fehlgeschlagen.", false);
  } finally {
    setLoading("connectBtn", false, "Verbinden");
  }
}

async function loadRecentCases() {
  try {
    const pages = await apiGet<BrainPage[]>("/api/pages?type=case&limit=10");
    const selects = document.querySelectorAll<HTMLSelectElement>(".case-select");
    selects.forEach((sel) => {
      sel.innerHTML =
        `<option value="">— Akte wählen —</option>` +
        pages
          .map((p) => `<option value="${escapeHtml(p.slug)}">${escapeHtml(p.title)}</option>`)
          .join("");
    });
  } catch {
    // Nicht-kritisch
  }
}

// ── Tab 1: Analysieren ────────────────────────────────────────────────

async function analyzeSelection() {
  setLoading("analyzeBtn", true, "Analysieren");
  clearResult("analyzeResult");
  try {
    const text = await getSelectedText();
    if (!text.trim()) {
      showStatus("Bitte Text in Word markieren.", false);
      return;
    }
    const result = await apiPost<AnalysisResult>("/api/legal/analyze", { text, mode: "contract" });
    renderTextResult(
      "analyzeResult",
      result.summary ?? result.text ?? "Keine Analyse zurückgegeben."
    );
  } catch (e) {
    showStatus(e instanceof Error ? e.message : "Analyse fehlgeschlagen.", false);
  } finally {
    setLoading("analyzeBtn", false, "Analysieren");
  }
}

async function summarizeSelection() {
  setLoading("summarizeBtn", true, "Zusammenfassen");
  clearResult("summarizeResult");
  try {
    const text = await getSelectedText();
    if (!text.trim()) {
      showStatus("Bitte Text markieren.", false);
      return;
    }
    const result = await apiPost<AnalysisResult>("/api/legal/summarize", { text });
    renderTextResult("summarizeResult", result.summary ?? result.text ?? "Keine Zusammenfassung.");
  } catch (e) {
    showStatus(e instanceof Error ? e.message : "Zusammenfassung fehlgeschlagen.", false);
  } finally {
    setLoading("summarizeBtn", false, "Zusammenfassen");
  }
}

async function extractObligations() {
  setLoading("obligBtn", true, "Extrahieren");
  clearResult("obligResult");
  try {
    const text = await getSelectedText();
    if (!text.trim()) {
      showStatus("Bitte Text markieren.", false);
      return;
    }
    const result = await apiPost<AnalysisResult>("/api/legal/obligation-extract", { text });
    const obligations = result.obligations ?? [];
    if (obligations.length === 0) {
      renderTextResult("obligResult", "Keine Pflichten gefunden.");
      return;
    }
    const el = document.getElementById("obligResult")!;
    el.innerHTML = obligations
      .map(
        (o) => `
      <div class="oblig-item risk-${o.risk ?? "low"}">
        <div class="oblig-type">${escapeHtml(o.type)}</div>
        <div class="oblig-party">Partei: ${escapeHtml(o.party)}</div>
        <div class="oblig-text">${escapeHtml(o.text)}</div>
        ${o.deadline ? `<div class="oblig-deadline">Frist: ${escapeHtml(o.deadline)}</div>` : ""}
      </div>
    `
      )
      .join("");
    el.style.display = "block";
  } catch (e) {
    showStatus(e instanceof Error ? e.message : "Extraktion fehlgeschlagen.", false);
  } finally {
    setLoading("obligBtn", false, "Pflichten extrahieren");
  }
}

async function checkRisks() {
  setLoading("riskBtn", true, "Prüfen");
  clearResult("riskResult");
  try {
    const text = await getSelectedText();
    if (!text.trim()) {
      showStatus("Bitte Text markieren.", false);
      return;
    }
    const result = await apiPost<AnalysisResult>("/api/legal/risk-analysis", { text });
    const findings = result.findings ?? [];
    const overallRisk = result.overall_risk ?? "low";
    const riskColors: Record<string, string> = {
      low: "#22c55e",
      medium: "#f59e0b",
      high: "#ef4444",
      critical: "#dc2626",
    };
    const el = document.getElementById("riskResult")!;
    el.innerHTML = `
      <div class="risk-overall" style="border-left:3px solid ${riskColors[overallRisk]};padding:6px 8px;margin-bottom:8px;">
        Gesamtrisiko: <strong style="color:${riskColors[overallRisk]}">${overallRisk.toUpperCase()}</strong>
      </div>
      ${findings
        .map(
          (f) => `
        <div class="risk-item" style="border-left:3px solid ${riskColors[f.severity]};padding:6px 8px;margin-bottom:6px;background:#0d0d1a;border-radius:4px;">
          <div style="font-weight:600;font-size:12px;color:${riskColors[f.severity]}">${escapeHtml(f.category)}</div>
          <div style="font-size:12px;margin:2px 0">${escapeHtml(f.description)}</div>
          ${f.clause ? `<div style="font-size:11px;color:#8a8aa8">Klausel: ${escapeHtml(f.clause)}</div>` : ""}
          <div style="font-size:11px;color:#a0a0c0;margin-top:3px">→ ${escapeHtml(f.recommendation)}</div>
        </div>
      `
        )
        .join("")}
    `;
    el.style.display = "block";
  } catch (e) {
    showStatus(e instanceof Error ? e.message : "Risikoanalyse fehlgeschlagen.", false);
  } finally {
    setLoading("riskBtn", false, "Risiken prüfen");
  }
}

// ── Tab 2: Vertrag ────────────────────────────────────────────────────

async function draftContract() {
  setLoading("draftBtn", true, "Entwurf erstellen");
  clearResult("draftResult");
  try {
    const instruction = (
      document.getElementById("draftInstruction") as HTMLInputElement
    ).value.trim();
    const template = (document.getElementById("draftTemplate") as HTMLSelectElement).value;
    let context = "";
    try {
      context = await getSelectedText();
    } catch {
      /* kein Text markiert — OK */
    }
    const result = await apiPost<AnalysisResult>("/api/legal/contract-draft", {
      context: context || undefined,
      instruction: instruction || template || "Erstelle einen vollständigen Vertrag",
      template_type: template || undefined,
    });
    const text = result.text ?? result.markdown ?? "";
    renderTextResult("draftResult", text, true);
    document.getElementById("insertDraftBtn")!.style.display = "block";
  } catch (e) {
    showStatus(e instanceof Error ? e.message : "Entwurf fehlgeschlagen.", false, "contractStatus");
  } finally {
    setLoading("draftBtn", false, "Entwurf erstellen");
  }
}

async function insertDraftIntoWord() {
  const el = document.getElementById("draftResult");
  if (!el?.dataset.raw) {
    showStatus("Zuerst Entwurf generieren.", false, "contractStatus");
    return;
  }
  try {
    await insertTextAtCursor(el.dataset.raw);
    showStatus("Vertragsentwurf in Word eingefügt.", true, "contractStatus");
  } catch (e) {
    showStatus(
      e instanceof Error ? e.message : "Einfügen fehlgeschlagen.",
      false,
      "contractStatus"
    );
  }
}

async function redlineContract() {
  setLoading("redlineBtn", true, "Redline erstellen");
  clearResult("redlineResult");
  try {
    const instruction = (
      document.getElementById("redlineInstruction") as HTMLInputElement
    ).value.trim();
    const original = await getSelectedText();
    if (!original.trim()) {
      showStatus("Bitte Original-Text markieren.", false, "contractStatus");
      return;
    }
    const result = await apiPost<AnalysisResult>("/api/legal/contract-redline", {
      original,
      instruction: instruction || "Überprüfe und verbessere diesen Vertrag",
    });
    const redlined = result.redlined ?? result.text ?? result.summary ?? "";
    const changes = result.changes ?? [];
    const el = document.getElementById("redlineResult")!;
    el.dataset.raw = redlined;
    el.innerHTML = `
      <div style="font-size:11px;color:#8a8aa8;margin-bottom:6px">${changes.length} Änderungen identifiziert</div>
      <div style="font-size:12px;line-height:1.5">${escapeHtml(redlined).replace(/\n/g, "<br>")}</div>
    `;
    el.style.display = "block";
    document.getElementById("insertRedlineBtn")!.style.display = "block";
  } catch (e) {
    showStatus(e instanceof Error ? e.message : "Redline fehlgeschlagen.", false, "contractStatus");
  } finally {
    setLoading("redlineBtn", false, "Redline erstellen");
  }
}

async function insertRedlineIntoWord() {
  const el = document.getElementById("redlineResult");
  if (!el?.dataset.raw) {
    showStatus("Zuerst Redline generieren.", false, "contractStatus");
    return;
  }
  try {
    await insertTextAtCursor(el.dataset.raw);
    showStatus("Redline in Word eingefügt.", true, "contractStatus");
  } catch (e) {
    showStatus(
      e instanceof Error ? e.message : "Einfügen fehlgeschlagen.",
      false,
      "contractStatus"
    );
  }
}

// ── Tab 3: Akte ───────────────────────────────────────────────────────

async function loadCaseContext() {
  const slug = (document.getElementById("contextCaseSelect") as HTMLSelectElement).value;
  if (!slug) {
    showStatus("Bitte Akte auswählen.", false, "akteStatus");
    return;
  }
  setLoading("contextBtn", true, "Laden");
  clearResult("contextResult");
  try {
    const result = await apiGet<AnalysisResult>(
      `/api/matter-context/${encodeURIComponent(slug)}/understanding`
    );
    renderTextResult(
      "contextResult",
      result.understanding ?? result.summary ?? result.facts ?? "Kein Kontext verfügbar."
    );
  } catch (e) {
    showStatus(
      e instanceof Error ? e.message : "Kontext-Abruf fehlgeschlagen.",
      false,
      "akteStatus"
    );
  } finally {
    setLoading("contextBtn", false, "Akten-Kontext laden");
  }
}

async function insertChronology() {
  const slug = (document.getElementById("chronoCaseSelect") as HTMLSelectElement).value;
  if (!slug) {
    showStatus("Bitte Akte auswählen.", false, "akteStatus");
    return;
  }
  setLoading("chronoBtn", true, "Generiere…");
  try {
    const result = await apiPost<AnalysisResult>("/api/legal/chronology", { case_slug: slug });
    await insertTextAtCursor(result.markdown ?? "");
    showStatus(`Chronologie mit ${result.count ?? "?"} Einträgen eingefügt.`, true, "akteStatus");
  } catch (e) {
    showStatus(e instanceof Error ? e.message : "Chronologie fehlgeschlagen.", false, "akteStatus");
  } finally {
    setLoading("chronoBtn", false, "Chronologie einfügen");
  }
}

async function triggerPipeline() {
  const slug = (document.getElementById("pipelineCaseSelect") as HTMLSelectElement).value;
  if (!slug) {
    showStatus("Bitte Akte auswählen.", false, "akteStatus");
    return;
  }
  setLoading("pipelineBtn", true, "Starte…");
  try {
    const result = await apiPost<AnalysisResult>("/api/pipeline/start", { case_slug: slug });
    showStatus(`Pipeline gestartet: ${result.status ?? "ok"}`, true, "akteStatus");
  } catch (e) {
    showStatus(
      e instanceof Error ? e.message : "Pipeline-Start fehlgeschlagen.",
      false,
      "akteStatus"
    );
  } finally {
    setLoading("pipelineBtn", false, "Pipeline starten");
  }
}

// ── Tab 4: Export ─────────────────────────────────────────────────────

async function exportDocx() {
  const slug = (document.getElementById("exportSlug") as HTMLInputElement).value.trim();
  if (!slug) {
    showStatus("Bitte Page Slug eingeben.", false, "exportStatus");
    return;
  }
  setLoading("exportBtn", true, "Exportiere…");
  try {
    const res = await fetch(`${API_BASE}/api/word-export`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ slug }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.docx`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus("Word-Dokument heruntergeladen.", true, "exportStatus");
  } catch (e) {
    showStatus(e instanceof Error ? e.message : "Export fehlgeschlagen.", false, "exportStatus");
  } finally {
    setLoading("exportBtn", false, ".docx herunterladen");
  }
}

async function saveAsBrainPage() {
  const title = (document.getElementById("saveTitle") as HTMLInputElement).value.trim();
  const caseSlug = (document.getElementById("saveCaseSelect") as HTMLSelectElement).value;
  setLoading("saveBtn", true, "Speichern…");
  try {
    let content = "";
    try {
      content = await getSelectedText();
    } catch {
      content = "";
    }
    if (!content.trim()) {
      showStatus("Bitte Text markieren der gespeichert werden soll.", false, "exportStatus");
      return;
    }
    await apiPost("/api/pages", {
      title: title || "Word-Dokument",
      content,
      type: "document",
      source_slug: caseSlug || undefined,
    });
    showStatus("Als Brain-Page gespeichert.", true, "exportStatus");
  } catch (e) {
    showStatus(e instanceof Error ? e.message : "Speichern fehlgeschlagen.", false, "exportStatus");
  } finally {
    setLoading("saveBtn", false, "Als Brain-Page speichern");
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function renderTextResult(containerId: string, text: string, storeRaw = false) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (storeRaw) el.dataset.raw = text;
  el.innerHTML = `<div style="font-size:12px;line-height:1.6;color:#c0c0d8">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`;
  el.style.display = "block";
}

function clearResult(containerId: string) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = "";
  el.style.display = "none";
  delete el.dataset.raw;
}

// ── Init ──────────────────────────────────────────────────────────────

Office.onReady(() => {
  document.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.getAttribute("data-tab") ?? "analyze"));
  });
  switchTab("analyze");
});

// Expose to global scope for HTML onclick handlers
const g = window as unknown as Record<string, unknown>;
g.connect = connect;
g.switchTab = switchTab;
g.analyzeSelection = analyzeSelection;
g.summarizeSelection = summarizeSelection;
g.extractObligations = extractObligations;
g.checkRisks = checkRisks;
g.draftContract = draftContract;
g.insertDraftIntoWord = insertDraftIntoWord;
g.redlineContract = redlineContract;
g.insertRedlineIntoWord = insertRedlineIntoWord;
g.loadCaseContext = loadCaseContext;
g.insertChronology = insertChronology;
g.triggerPipeline = triggerPipeline;
g.exportDocx = exportDocx;
g.saveAsBrainPage = saveAsBrainPage;
