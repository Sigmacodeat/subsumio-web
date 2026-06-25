/* Word Add-in Task Pane — separater Build (office-js Types bei Bedarf installieren)
   npm install -g office-toolbox && npm run build
*/

interface BrainPage {
  slug: string;
  title: string;
  type: string;
  content: string;
  frontmatter?: Record<string, unknown>;
}

const API_BASE = "https://subsum.io";
let token = "";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Office: any;

function showStatus(msg: string, ok: boolean) {
  const el = document.getElementById("status")!;
  el.textContent = msg;
  el.className = `status ${ok ? "ok" : "err"}`;
  el.style.display = "block";
}

async function connect() {
  const input = document.getElementById("token") as HTMLInputElement;
  token = input.value.trim();
  if (!token) {
    showStatus("Bitte API-Token eingeben.", false);
    return;
  }

  const btn = document.getElementById("connectBtn") as HTMLButtonElement;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Verbinde…';

  try {
    const res = await fetch(`${API_BASE}/api/brain/pages?type=document_draft&limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const pages = (await res.json()) as BrainPage[];
    showStatus(`${pages.length} Dokumente geladen.`, true);
    renderDocs(pages);
    // Show extended sections after successful connect
    document.getElementById("pipelineSection")!.style.display = "block";
    document.getElementById("chronoSection")!.style.display = "block";
    document.getElementById("exportSection")!.style.display = "block";
  } catch (e) {
    showStatus(e instanceof Error ? e.message : "Verbindung fehlgeschlagen.", false);
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Verbinden";
  }
}

function renderDocs(pages: BrainPage[]) {
  const list = document.getElementById("docsList")!;
  list.innerHTML = "";
  pages.forEach((p) => {
    const item = document.createElement("div");
    item.className = "doc-item";
    item.innerHTML = `<div class="title">${escapeHtml(p.title)}</div><div class="meta">${escapeHtml(p.type)} · ${escapeHtml(p.slug)}</div>`;
    item.onclick = () => insertDoc(p);
    list.appendChild(item);
  });
  document.getElementById("docsSection")!.style.display = "block";
}

async function insertDoc(page: BrainPage) {
  showStatus("Füge ein…", true);
  try {
    await Office.context.document.setSelectedDataAsync(page.content, {
      coercionType: Office.CoercionType.Text,
    });
    showStatus(`„${page.title}" eingefügt.`, true);
  } catch (_e) {
    showStatus("Einfügen fehlgeschlagen. Word API nicht verfügbar?", false);
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Expose to global scope for inline onclick handlers
(window as unknown as Record<string, unknown>).connect = connect;

// ── Gap 20: Pipeline Trigger ──────────────────────────────
async function triggerPipeline() {
  const input = document.getElementById("caseSlug") as HTMLInputElement;
  const caseSlug = input.value.trim();
  if (!caseSlug) {
    showPipelineStatus("Bitte Case Slug eingeben.", false);
    return;
  }

  const btn = document.getElementById("pipelineBtn") as HTMLButtonElement;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Starte…';

  try {
    const res = await fetch(`${API_BASE}/api/pipeline/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ case_slug: caseSlug }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();
    showPipelineStatus(`Pipeline gestartet: ${result.status}`, true);
  } catch (e) {
    showPipelineStatus(e instanceof Error ? e.message : "Pipeline-Start fehlgeschlagen.", false);
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Pipeline starten";
  }
}

function showPipelineStatus(msg: string, ok: boolean) {
  const el = document.getElementById("pipelineStatus")!;
  el.textContent = msg;
  el.className = `status ${ok ? "ok" : "err"}`;
  el.style.display = "block";
}

// ── Gap 20: Chronology Insert ─────────────────────────────
async function insertChronology() {
  const input = document.getElementById("chronoCase") as HTMLInputElement;
  const caseSlug = input.value.trim();
  if (!caseSlug) {
    showStatus("Bitte Case Slug eingeben.", false);
    return;
  }

  const btn = document.getElementById("chronoBtn") as HTMLButtonElement;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Generiere…';

  try {
    const res = await fetch(`${API_BASE}/api/legal/chronology`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ case_slug: caseSlug }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();
    const md = result.markdown as string;

    await Office.context.document.setSelectedDataAsync(md, {
      coercionType: Office.CoercionType.Text,
    });
    showStatus(`Chronologie mit ${result.count} Einträgen eingefügt.`, true);
  } catch (e) {
    showStatus(e instanceof Error ? e.message : "Chronologie fehlgeschlagen.", false);
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Chronologie generieren & einfügen";
  }
}

// ── Gap 20: .docx Export ──────────────────────────────────
async function exportDocx() {
  const input = document.getElementById("exportSlug") as HTMLInputElement;
  const slug = input.value.trim();
  if (!slug) {
    showStatus("Bitte Page Slug eingeben.", false);
    return;
  }

  const btn = document.getElementById("exportBtn") as HTMLButtonElement;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Exportiere…';

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
    showStatus("Word-Dokument heruntergeladen.", true);
  } catch (e) {
    showStatus(e instanceof Error ? e.message : "Export fehlgeschlagen.", false);
  } finally {
    btn.disabled = false;
    btn.innerHTML = ".docx herunterladen";
  }
}

// Expose new functions to global scope
(window as unknown as Record<string, unknown>).triggerPipeline = triggerPipeline;
(window as unknown as Record<string, unknown>).insertChronology = insertChronology;
(window as unknown as Record<string, unknown>).exportDocx = exportDocx;
