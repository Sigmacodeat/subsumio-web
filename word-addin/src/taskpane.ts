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

const API_BASE = "https://sigmabrain.com";
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
  if (!token) { showStatus("Bitte API-Token eingeben.", false); return; }

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
    await Office.context.document.setSelectedDataAsync(page.content, { coercionType: Office.CoercionType.Text });
    showStatus(`„${page.title}" eingefügt.`, true);
  } catch (e) {
    showStatus("Einfügen fehlgeschlagen. Word API nicht verfügbar?", false);
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Expose to global scope for inline onclick handlers
(window as unknown as Record<string, unknown>).connect = connect;
