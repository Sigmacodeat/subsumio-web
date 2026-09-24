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
  redlines?: Array<{
    original_clause: string;
    suggested_text: string;
    change_type: "add" | "remove" | "modify";
    reason: string;
    risk_level?: string;
    legal_basis?: string;
  }>;
  understanding?: string;
  facts?: string;
  /** Slugs or citations the answer is based on, when the API supplies them. */
  sources?: string[];
  citations?: Array<{ slug?: string; title?: string; source?: string }>;
}

/** Readable source labels from whatever shape the API returned. */
function sourcesOf(result: AnalysisResult): string[] {
  if (Array.isArray(result.sources)) return result.sources.filter(Boolean);
  if (Array.isArray(result.citations)) {
    return result.citations
      .map((c) => c.title || c.slug || c.source || "")
      .filter((s): s is string => Boolean(s));
  }
  return [];
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

async function uploadTextDocument(
  title: string,
  content: string,
  caseSlug?: string
): Promise<{ slug: string; title: string }> {
  const safeTitle = (title || "Word-Dokument").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 180);
  const form = new FormData();
  form.append("file", new File([content], `${safeTitle}.txt`, { type: "text/plain" }));
  form.append("title", safeTitle);
  form.append("source", caseSlug ? "documents" : "kanzleiwissen");
  if (caseSlug) form.append("case_slug", caseSlug);
  const res = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as Record<
      string,
      string
    >;
    throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ slug: string; title: string }>;
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
    // Cases are stored with the engine type "legal_case" (see
    // src/app/dashboard/cases/new/page.tsx and api/pages/route.ts) — this
    // was querying the wrong type and always returned an empty list, so the
    // case-select dropdowns in the add-in stayed empty.
    const pages = await apiGet<BrainPage[]>("/api/pages?type=legal_case&limit=10");
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
      result.summary ?? result.text ?? "Keine Analyse zurückgegeben.",
      false,
      { sources: sourcesOf(result) }
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
    renderTextResult(
      "summarizeResult",
      result.summary ?? result.text ?? "Keine Zusammenfassung.",
      false,
      { sources: sourcesOf(result) }
    );
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
      renderTextResult("obligResult", "Keine Pflichten gefunden.", false, { ai: false });
      return;
    }
    const el = document.getElementById("obligResult")!;
    el.innerHTML =
      obligations
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
        .join("") + aiNoticeHtml(sourcesOf(result));
    el.style.display = "block";
    void groundResult(el, obligations.map((o) => `${o.type}: ${o.text}`).join("\n"));
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
      ${aiNoticeHtml(sourcesOf(result))}
    `;
    el.style.display = "block";
    void groundResult(
      el,
      findings.map((f) => `${f.category}: ${f.description} ${f.recommendation}`).join("\n")
    );
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
    renderTextResult("draftResult", text, true, { sources: sourcesOf(result) });
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

async function loadPlaybooks() {
  const sel = document.getElementById("redlinePlaybook") as HTMLSelectElement | null;
  if (!sel || !token) return;
  try {
    const data = await apiGet<{ playbooks?: Array<{ slug: string; title: string }> }>(
      "/api/legal/playbooks"
    );
    const items = data.playbooks ?? [];
    for (const pb of items) {
      const opt = document.createElement("option");
      opt.value = pb.slug;
      opt.textContent = pb.title;
      sel.appendChild(opt);
    }
  } catch {
    // Playbooks optional — select stays at "optional" entry
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
    const playbookSlug = (document.getElementById("redlinePlaybook") as HTMLSelectElement).value;
    const perspective = (document.getElementById("redlinePerspective") as HTMLSelectElement)
      .value as "client" | "counterparty" | "neutral";
    const result = await apiPost<AnalysisResult>("/api/legal/contract-redline", {
      original_text: original,
      instruction: instruction || "Überprüfe und verbessere diesen Vertrag",
      ...(playbookSlug ? { playbook_slug: playbookSlug } : {}),
      perspective,
    });
    const redlines = result.redlines ?? [];
    const redlined =
      redlines.length > 0
        ? applyRedlines(original, redlines)
        : (result.redlined ?? result.text ?? result.summary ?? "");
    const el = document.getElementById("redlineResult")!;
    el.dataset.raw = redlined;
    el.dataset.original = original;
    const changeList = redlines
      .slice(0, 20)
      .map(
        (r) =>
          `<div style="margin-top:6px;padding:6px;border:1px solid #2a2a44;border-radius:6px">
            <div style="font-size:10px;color:#8a8aa8">${escapeHtml(r.change_type.toUpperCase())}${r.risk_level ? ` · ${escapeHtml(r.risk_level)}` : ""}${r.legal_basis ? ` · ${escapeHtml(r.legal_basis)}` : ""}</div>
            <div style="font-size:11px;line-height:1.4">${escapeHtml(r.suggested_text.slice(0, 300))}</div>
            <div style="font-size:10px;color:#8a8aa8;margin-top:2px">${escapeHtml(r.reason)}</div>
          </div>`
      )
      .join("");
    el.innerHTML = `
      <div style="font-size:11px;color:#8a8aa8;margin-bottom:6px">${redlines.length} Änderungen identifiziert</div>
      ${result.summary ? `<div style="font-size:11px;line-height:1.5;margin-bottom:6px">${escapeHtml(result.summary)}</div>` : ""}
      ${changeList}
      ${aiNoticeHtml(sourcesOf(result))}
    `;
    el.style.display = "block";
    void groundResult(
      el,
      [result.summary ?? "", ...redlines.map((r) => `${r.suggested_text} ${r.legal_basis ?? ""}`)]
        .join("\n")
        .trim()
    );
    document.getElementById("insertRedlineBtn")!.style.display = "block";
    document.getElementById("insertTrackedBtn")!.style.display = "block";
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

// ── Tracked Changes (WP-5.26) ─────────────────────────────────────────

/** Applies the engine's structured redlines to produce a revised text.
 *  modify/remove rely on the verbatim `original_clause` guarantee. */
function applyRedlines(
  original: string,
  redlines: NonNullable<AnalysisResult["redlines"]>
): string {
  let out = original;
  const additions: string[] = [];
  for (const r of redlines) {
    if (r.change_type === "add" || !r.original_clause) {
      if (r.change_type === "add" && r.suggested_text) additions.push(r.suggested_text);
      continue;
    }
    if (out.includes(r.original_clause)) {
      out = out.replace(r.original_clause, r.change_type === "remove" ? "" : r.suggested_text);
    }
  }
  if (additions.length > 0) {
    out = out.replace(/\n+$/, "") + "\n\n" + additions.join("\n\n");
  }
  return out;
}

type DiffOp = { type: "same" | "del" | "ins"; text: string };

/** Line-level LCS diff; falls back to full replace for very long texts. */
function diffLines(oldLines: string[], newLines: string[]): DiffOp[] {
  const n = oldLines.length;
  const m = newLines.length;
  if (n === 0) return newLines.map((text) => ({ type: "ins", text }));
  if (m === 0) return oldLines.map((text) => ({ type: "del", text }));
  if (n * m > 200_000) {
    return [
      ...oldLines.map((text) => ({ type: "del" as const, text })),
      ...newLines.map((text) => ({ type: "ins" as const, text })),
    ];
  }
  // DP table of LCS lengths
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ type: "same", text: newLines[j] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "del", text: oldLines[i] });
      i++;
    } else {
      ops.push({ type: "ins", text: newLines[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: "del", text: oldLines[i++] });
  while (j < m) ops.push({ type: "ins", text: newLines[j++] });
  return ops;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Builds an OOXML package whose paragraphs carry real w:ins/w:del revision marks. */
function buildTrackedChangesOoxml(original: string, revised: string): string {
  const ops = diffLines(original.split("\n"), revised.split("\n"));
  const date = new Date().toISOString();
  let revId = 1;
  const paras = ops
    .map((op) => {
      const text = escapeXml(op.text);
      if (op.type === "same") {
        return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
      }
      const id = revId++;
      if (op.type === "del") {
        return `<w:p><w:del w:id="${id}" w:author="Subsumio" w:date="${date}"><w:r><w:delText xml:space="preserve">${text}</w:delText></w:r></w:del></w:p>`;
      }
      return `<w:p><w:ins w:id="${id}" w:author="Subsumio" w:date="${date}"><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:ins></w:p>`;
    })
    .join("");
  return `<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage"><pkg:part pkg:name="/_rels/.rels" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml" pkg:padding="512"><pkg:xmlData><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="/word/document.xml"/></Relationships></pkg:xmlData></pkg:part><pkg:part pkg:name="/word/document.xml" pkg:contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"><pkg:xmlData><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}</w:body></w:document></pkg:xmlData></pkg:part></pkg:package>`;
}

async function insertRedlineTrackedChanges() {
  const el = document.getElementById("redlineResult");
  const revised = el?.dataset.raw;
  const original = el?.dataset.original ?? "";
  if (!revised) {
    showStatus("Zuerst Redline generieren.", false, "contractStatus");
    return;
  }
  setLoading("insertTrackedBtn", true, "Einfügen…");
  try {
    const ooxml = buildTrackedChangesOoxml(original, revised);
    await new Promise<void>((resolve, reject) => {
      Office.context.document.setSelectedDataAsync(
        ooxml,
        { coercionType: Office.CoercionType.Ooxml },
        (result: Office.AsyncResult<void>) => {
          if (result.status === Office.AsyncResultStatus.Succeeded) resolve();
          else reject(new Error(result.error?.message ?? "Einfügen fehlgeschlagen"));
        }
      );
    });
    showStatus("Tracked Changes eingefügt — Änderungen in Word prüfbar.", true, "contractStatus");
  } catch (e) {
    showStatus(
      e instanceof Error ? e.message : "Tracked-Changes-Einfügen fehlgeschlagen.",
      false,
      "contractStatus"
    );
  } finally {
    setLoading("insertTrackedBtn", false, "Als Tracked Changes einfügen");
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
      result.understanding ?? result.summary ?? result.facts ?? "Kein Kontext verfügbar.",
      false,
      { sources: sourcesOf(result) }
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
    await uploadTextDocument(title || "Word-Dokument", content, caseSlug || undefined);
    showStatus("Über die Dokument-Pipeline gespeichert.", true, "exportStatus");
  } catch (e) {
    showStatus(e instanceof Error ? e.message : "Speichern fehlgeschlagen.", false, "exportStatus");
  } finally {
    setLoading("saveBtn", false, "Als Brain-Page speichern");
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Every AI answer in the task pane carries the same notice as the dashboard
 * (EU AI Act Art. 50): it is a draft a lawyer has to check. The pane showed
 * bare model output before, which is exactly what the rest of the product is
 * built to prevent. Sources are listed when the API returns them.
 */
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

/** Verified/unverified counts plus the badge, the add-in's CitationPanel. */
function groundingHtml(g: GroundingResult): string {
  const unverified = (g.grounded_citations ?? [])
    .filter((c) => !c.verified)
    .slice(0, 6)
    .map((c) => escapeHtml(`${c.paragraph} ${c.code}`.trim()));
  const counts =
    g.citations_verified + g.citations_unverified === 0
      ? "Keine Normzitate erkannt."
      : `${g.citations_verified} Zitat(e) im Korpus bestätigt · ${g.citations_unverified} nicht bestätigt`;
  return `<div style="margin-top:6px;font-size:11px;color:${g.citations_unverified > 0 ? "#ef9a9a" : "#9ad0a0"}">${counts}</div>${
    unverified.length > 0
      ? `<div style="font-size:11px;color:#ef9a9a">Nicht bestätigt: ${unverified.join(" · ")}</div>`
      : ""
  }${g.warning ? `<div style="font-size:11px;color:#e0b341">${escapeHtml(g.warning)}</div>` : ""}`;
}

/**
 * Grounding invariant (CLAUDE.md): after an AI answer is on screen, check its
 * citations against the corpus via /api/legal/ground and show the result.
 * Non-blocking; a failure leaves an explicit "please check manually" line.
 */
async function groundResult(el: HTMLElement, answer: string): Promise<void> {
  const text = answer.trim();
  if (text.length < 10) return;
  const slot = document.createElement("div");
  slot.style.cssText = "margin-top:6px;font-size:11px;color:#9a9ab8";
  slot.textContent = "Fundstellen werden geprüft…";
  (el.querySelector(".ai-notice") ?? el).appendChild(slot);
  try {
    const g = await apiPost<GroundingResult>("/api/legal/ground", { text: text.slice(0, 50_000) });
    slot.innerHTML = groundingHtml(g);
  } catch {
    slot.textContent = "Fundstellenprüfung nicht verfügbar — Zitate bitte manuell prüfen.";
  }
}

function aiNoticeHtml(sources?: string[]): string {
  const list =
    sources && sources.length > 0
      ? `<div style="margin-top:6px;font-size:11px;color:#9a9ab8">Quellen: ${sources
          .slice(0, 6)
          .map((s) => escapeHtml(s))
          .join(" · ")}</div>`
      : `<div style="margin-top:6px;font-size:11px;color:#9a9ab8">Ohne Fundstellen — bitte gegen die Akte prüfen.</div>`;
  return `<div class="ai-notice" style="margin-top:10px;padding:8px 10px;border:1px solid #4a4a6a;border-radius:6px;background:#2a2a40">
    <div style="font-size:11px;font-weight:700;color:#e0b341">${AI_BADGE_LABEL}</div>
    <div style="font-size:11px;color:#e0b341">${AI_NOTICE}</div>
    ${list}
  </div>`;
}

function renderTextResult(
  containerId: string,
  text: string,
  storeRaw = false,
  options: { ai?: boolean; sources?: string[] } = {}
) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (storeRaw) el.dataset.raw = text;
  const notice = options.ai === false ? "" : aiNoticeHtml(options.sources);
  el.innerHTML = `<div style="font-size:12px;line-height:1.6;color:#c0c0d8">${escapeHtml(text).replace(/\n/g, "<br>")}</div>${notice}`;
  el.style.display = "block";
  if (options.ai !== false) void groundResult(el, text);
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
  void loadPlaybooks();
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
g.insertRedlineTrackedChanges = insertRedlineTrackedChanges;
g.loadCaseContext = loadCaseContext;
g.insertChronology = insertChronology;
g.triggerPipeline = triggerPipeline;
g.exportDocx = exportDocx;
g.saveAsBrainPage = saveAsBrainPage;
