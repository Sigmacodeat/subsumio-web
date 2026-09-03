(function () {
  const t = document.createElement("link").relList;
  if (t && t.supports && t.supports("modulepreload")) return;
  for (const r of document.querySelectorAll('link[rel="modulepreload"]')) s(r);
  new MutationObserver((r) => {
    for (const i of r)
      if (i.type === "childList")
        for (const o of i.addedNodes) o.tagName === "LINK" && o.rel === "modulepreload" && s(o);
  }).observe(document, { childList: !0, subtree: !0 });
  function n(r) {
    const i = {};
    return (
      r.integrity && (i.integrity = r.integrity),
      r.referrerPolicy && (i.referrerPolicy = r.referrerPolicy),
      r.crossOrigin === "use-credentials"
        ? (i.credentials = "include")
        : r.crossOrigin === "anonymous"
          ? (i.credentials = "omit")
          : (i.credentials = "same-origin"),
      i
    );
  }
  function s(r) {
    if (r.ep) return;
    r.ep = !0;
    const i = n(r);
    fetch(r.href, i);
  }
})();
const z = "https://subsum.io";
let y = "",
  T = null,
  b = !0,
  R = "",
  $ = [],
  A = "",
  C = "",
  P = "",
  k = null;
function f(e) {
  return e
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function a(e, t, n = "status") {
  const s = document.getElementById(n);
  s &&
    ((s.textContent = e),
    (s.className = `section-status ${t ? "ok" : "err"}`),
    (s.style.display = "block"),
    t &&
      setTimeout(() => {
        s.textContent === e && (s.style.display = "none");
      }, 5e3));
}
function M(e) {
  const t = document.getElementById(e);
  t && (t.style.display = "none");
}
function l(e, t, n) {
  const s = document.getElementById(e);
  s && ((s.disabled = t), (s.innerHTML = t ? '<div class="spinner"></div> Wird verarbeitet…' : n));
}
async function w() {
  return new Promise((e, t) => {
    Office.context.document.getSelectedDataAsync(Office.CoercionType.Text, (n) => {
      var s;
      n.status === Office.AsyncResultStatus.Succeeded
        ? e(n.value || "")
        : t(new Error(((s = n.error) == null ? void 0 : s.message) ?? "Kein Text ausgewählt"));
    });
  });
}
async function j() {
  return new Promise((e, t) => {
    Office.context.document.getFileAsync(Office.FileType.Text, { sliceSize: 65536 }, async (n) => {
      var o;
      if (n.status !== Office.AsyncResultStatus.Succeeded) {
        t(
          new Error(
            ((o = n.error) == null ? void 0 : o.message) ?? "Dokument konnte nicht gelesen werden"
          )
        );
        return;
      }
      const s = n.value,
        r = s.sliceCount;
      let i = "";
      for (let d = 0; d < r; d++) {
        const g = await new Promise((v, S) => {
          s.getSliceAsync(d, (x) => {
            var c;
            x.status === Office.AsyncResultStatus.Succeeded
              ? v(x.value)
              : S(new Error(((c = x.error) == null ? void 0 : c.message) ?? "Slice-Lesefehler"));
          });
        });
        i += new TextDecoder("utf-8").decode(g.data);
      }
      (s.closeAsync(), e(i));
    });
  });
}
async function B(e) {
  return new Promise((t, n) => {
    Office.context.document.setSelectedDataAsync(
      e,
      { coercionType: Office.CoercionType.Text },
      (s) => {
        var r;
        s.status === Office.AsyncResultStatus.Succeeded
          ? t()
          : n(new Error(((r = s.error) == null ? void 0 : r.message) ?? "Einfügen fehlgeschlagen"));
      }
    );
  });
}
async function W(e, t) {
  if (typeof Word < "u" && Word.run) {
    await Word.run(async (n) => {
      (t && (n.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll),
        n.document.body.insertParagraph(e, Word.InsertLocation.end),
        await n.sync());
    });
    return;
  }
  await B(e);
}
async function H(e) {
  if (typeof Word < "u" && Word.run) {
    await Word.run(async (t) => {
      (t.document.body.insertText("", Word.InsertLocation.end).insertEndnote(e), await t.sync());
    });
    return;
  }
  await B(`
[Endnote: ${e}]
`);
}
async function m(e, t) {
  const n = await fetch(`${z}${e}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${y}` },
    body: JSON.stringify(t),
  });
  if (!n.ok) {
    const s = await n.json().catch(() => ({ error: `HTTP ${n.status}` }));
    throw new Error(s.error ?? s.message ?? `HTTP ${n.status}`);
  }
  return n.json();
}
async function I(e, t) {
  const n = await fetch(`${z}${e}`, { headers: { Authorization: `Bearer ${y}` }, signal: t });
  if (!n.ok) throw new Error(`HTTP ${n.status}`);
  return n.json();
}
async function h(e) {
  if (!b || !e.trim()) return e;
  try {
    return (await m("/api/legal/anonymize", { text: e })).anonymized;
  } catch {
    return e;
  }
}
async function K(e, t, n) {
  const s = e.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 180),
    r = new FormData();
  (r.append("file", new File([t], `${s}.txt`, { type: "text/plain" })),
    r.append("title", s),
    r.append("source", n ? "documents" : "kanzleiwissen"),
    n && r.append("case_slug", n));
  const i = await fetch(`${z}/api/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${y}` },
    body: r,
  });
  if (!i.ok) {
    const o = await i.json().catch(() => ({ error: `HTTP ${i.status}` }));
    throw new Error(o.message ?? o.error ?? `HTTP ${i.status}`);
  }
  return i.json();
}
function L(e) {
  (document.querySelectorAll(".tab-btn").forEach((t) => {
    t.classList.toggle("active", t.getAttribute("data-tab") === e);
  }),
    document.querySelectorAll(".tab-panel").forEach((t) => {
      t.style.display = t.getAttribute("data-panel") === e ? "block" : "none";
    }));
}
async function F() {
  if (((y = document.getElementById("token").value.trim()), !y)) {
    a("Bitte API-Token eingeben.", !1);
    return;
  }
  l("connectBtn", !0, "Verbinden");
  try {
    (await I("/api/pages?limit=1"),
      a("Erfolgreich verbunden.", !0),
      (document.getElementById("mainContent").style.display = "block"),
      (document.getElementById("authSection").style.display = "none"),
      (T = new Date()),
      O(),
      await G());
  } catch (t) {
    a(t instanceof Error ? t.message : "Verbindung fehlgeschlagen.", !1);
  } finally {
    l("connectBtn", !1, "Verbinden");
  }
}
function Z() {
  ((y = ""),
    (T = null),
    (document.getElementById("mainContent").style.display = "none"),
    (document.getElementById("authSection").style.display = "block"),
    (document.getElementById("token").value = ""),
    a("Getrennt.", !0));
}
function _() {
  y &&
    navigator.clipboard
      .writeText(y)
      .then(() => a("Token in Zwischenablage kopiert.", !0))
      .catch(() => a("Kopieren fehlgeschlagen.", !1));
}
async function G() {
  try {
    const e = await I("/api/pages?type=case&limit=10");
    document.querySelectorAll(".case-select").forEach((n) => {
      n.innerHTML =
        '<option value="">— Akte wählen —</option>' +
        e.map((s) => `<option value="${f(s.slug)}">${f(s.title)}</option>`).join("");
    });
  } catch {}
}
async function D() {
  const e = document.getElementById("rechercheQuery").value.trim(),
    t = document.getElementById("rechercheJurisdiction").value;
  if (!e) {
    a("Bitte eine Rechtsfrage eingeben.", !1, "rechercheStatus");
    return;
  }
  (k && k.abort(),
    (k = new AbortController()),
    l("rechercheBtn", !0, "Suchen"),
    M("rechercheStatus"),
    p("rechercheResult"),
    (document.getElementById("citationPanel").style.display = "none"),
    (document.getElementById("insertAnswerBtn").style.display = "none"),
    (document.getElementById("insertEndnotesBtn").style.display = "none"));
  try {
    const n = await h(e),
      [s, r, i] = await Promise.allSettled([
        I(
          `/api/legal/statute-search?q=${encodeURIComponent(n)}&jurisdiction=${t}&limit=10`,
          k.signal
        ),
        I(
          `/api/legal/judgements-search?q=${encodeURIComponent(n)}&jurisdiction=${t}&limit=10`,
          k.signal
        ),
        m("/api/legal/precedent-search", {
          query: n,
          jurisdiction: t === "all" ? void 0 : t,
          limit: 10,
        }),
      ]),
      o = s.status === "fulfilled" ? s.value.results : [],
      d = r.status === "fulfilled" ? r.value.results : [],
      g = i.status === "fulfilled" ? i.value.results : [];
    if (o.length === 0 && d.length === 0 && g.length === 0) {
      const c = document.getElementById("rechercheResult");
      ((c.innerHTML =
        '<div class="empty-state"><div class="empty-state-icon">∅</div>Keine Treffer. Suche verfeinern oder andere Jurisdiktion wählen.</div>'),
        (c.style.display = "block"));
      return;
    }
    const v = [];
    (o.length > 0 &&
      v.push(
        `## Relevante Gesetzesstellen (${o.length})
` +
          o
            .slice(0, 5)
            .map(
              (c) =>
                `**${c.label} ${c.paragraph ?? ""}** (${c.jurisdiction.toUpperCase()}): ${c.excerpt.slice(0, 300)}…`
            ).join(`

`)
      ),
      d.length > 0 &&
        v.push(
          `## Judikatur (${d.length})
` +
            d.slice(0, 5).map(
              (c) => `**${c.title}** — ${c.court} ${c.date} (${c.caseNumber})
${c.snippet.slice(0, 300)}`
            ).join(`

`)
        ),
      g.length > 0 &&
        v.push(
          `## Präjudikien / Precedent (${g.length})
` +
            g.slice(0, 5).map(
              (c) => `**${c.title}** — ${c.court} ${c.date} (${c.legalArea})
${c.keyHolding.slice(0, 300)}`
            ).join(`

`)
        ));
    const S = v.join(`

---

`);
    ((R = S),
      ($ = [
        ...o.map((c) => ({
          title: `${c.label} ${c.paragraph ?? ""}`,
          meta: `Gesetz · ${c.jurisdiction.toUpperCase()}`,
          snippet: c.excerpt.slice(0, 200),
        })),
        ...d.map((c) => ({
          title: c.title,
          meta: `Judikatur · ${c.court} ${c.date}`,
          snippet: c.snippet.slice(0, 200),
          url: c.url,
        })),
        ...g.map((c) => ({
          title: c.title,
          meta: `Precedent · ${c.court} ${c.date}`,
          snippet: c.keyHolding.slice(0, 200),
        })),
      ]));
    const x = document.getElementById("rechercheResult");
    (x.classList.add("fade-in"),
      (x.innerHTML = `<div style="font-size:12px;line-height:1.6;color:#c0c0d8;white-space:pre-wrap">${f(S).replace(/\n/g, "<br>")}</div>`),
      (x.style.display = "block"),
      (document.getElementById("insertAnswerBtn").style.display = "block"),
      $.length > 0 && (document.getElementById("insertEndnotesBtn").style.display = "block"),
      U(S),
      a(
        `${o.length} Gesetze, ${d.length} Judikate, ${g.length} Präjudizien gefunden.`,
        !0,
        "rechercheStatus"
      ));
  } catch (n) {
    if (n.name === "AbortError") return;
    a(n instanceof Error ? n.message : "Recherche fehlgeschlagen.", !1, "rechercheStatus");
  } finally {
    l("rechercheBtn", !1, "Suchen (Gesetze + Judikatur + Precedent)");
  }
}
async function U(e) {
  try {
    const t = await m("/api/legal/ground", { text: e });
    q(t);
  } catch {}
}
function q(e) {
  const t = document.getElementById("citationPanel"),
    n = document.getElementById("citationVerified"),
    s = document.getElementById("citationUnverified"),
    r = document.getElementById("citationList");
  ((n.textContent = `${e.citations_verified} verifiziert`),
    (s.textContent = `${e.citations_unverified} offen`));
  const i = e.grounded_citations ?? [];
  (i.length === 0
    ? (r.innerHTML =
        '<div style="color:#8a8aa8;font-size:11px">Keine Quellen-Zitate im Antworttext erkannt.</div>')
    : (r.innerHTML = i
        .map(
          (o) => `
      <div class="citation-item ${o.verified ? "verified" : "unverified"}">
        <div class="citation-code">${f(o.code)} ${f(o.paragraph ?? "")} ${o.verified ? "✓" : "⚠"}</div>
        <div class="citation-context">${f(o.context.slice(0, 150))}</div>
      </div>
    `
        )
        .join("")),
    (t.style.display = "block"),
    t.classList.add("fade-in"));
}
async function J() {
  if (!R) {
    a("Zuerst Recherche durchführen.", !1, "rechercheStatus");
    return;
  }
  try {
    (await B(R), a("Antwort in Word eingefügt.", !0, "rechercheStatus"));
  } catch (e) {
    a(e instanceof Error ? e.message : "Einfügen fehlgeschlagen.", !1, "rechercheStatus");
  }
}
async function N() {
  if ($.length === 0) {
    a("Keine Quellen vorhanden.", !1, "rechercheStatus");
    return;
  }
  try {
    for (const e of $) {
      const t = `${e.title} — ${e.meta}${e.url ? ` (${e.url})` : ""}`;
      await H(t);
    }
    a(`${$.length} Quellen als Endnoten eingefügt.`, !0, "rechercheStatus");
  } catch (e) {
    a(e instanceof Error ? e.message : "Endnoten-Einfügen fehlgeschlagen.", !1, "rechercheStatus");
  }
}
async function Q() {
  (l("analyzeBtn", !0, "Analysieren"), p("analyzeResult"));
  try {
    const e = await w();
    if (!e.trim()) {
      a("Bitte Text in Word markieren.", !1);
      return;
    }
    const t = await h(e),
      n = await m("/api/legal/analyze", { text: t, mode: "contract" });
    E("analyzeResult", n.summary ?? n.text ?? "Keine Analyse zurückgegeben.");
  } catch (e) {
    a(e instanceof Error ? e.message : "Analyse fehlgeschlagen.", !1);
  } finally {
    l("analyzeBtn", !1, "Analysieren");
  }
}
async function V() {
  (l("summarizeBtn", !0, "Zusammenfassen"), p("summarizeResult"));
  try {
    const e = await w();
    if (!e.trim()) {
      a("Bitte Text markieren.", !1);
      return;
    }
    const t = await h(e),
      n = await m("/api/legal/summarize", { text: t });
    E("summarizeResult", n.summary ?? n.text ?? "Keine Zusammenfassung.");
  } catch (e) {
    a(e instanceof Error ? e.message : "Zusammenfassung fehlgeschlagen.", !1);
  } finally {
    l("summarizeBtn", !1, "Zusammenfassen");
  }
}
async function X() {
  (l("obligBtn", !0, "Extrahieren"), p("obligResult"));
  try {
    const e = await w();
    if (!e.trim()) {
      a("Bitte Text markieren.", !1);
      return;
    }
    const t = await h(e),
      s = (await m("/api/legal/obligation-extract", { text: t })).obligations ?? [];
    if (s.length === 0) {
      E("obligResult", "Keine Pflichten gefunden.");
      return;
    }
    const r = document.getElementById("obligResult");
    ((r.innerHTML = s
      .map(
        (i) => `
      <div class="oblig-item risk-${i.risk ?? "low"}">
        <div class="oblig-type">${f(i.type)}</div>
        <div class="oblig-party">Partei: ${f(i.party)}</div>
        <div class="oblig-text">${f(i.text)}</div>
        ${i.deadline ? `<div class="oblig-deadline">Frist: ${f(i.deadline)}</div>` : ""}
      </div>
    `
      )
      .join("")),
      (r.style.display = "block"));
  } catch (e) {
    a(e instanceof Error ? e.message : "Extraktion fehlgeschlagen.", !1);
  } finally {
    l("obligBtn", !1, "Pflichten extrahieren");
  }
}
async function Y() {
  (l("riskBtn", !0, "Prüfen"), p("riskResult"));
  try {
    const e = await w();
    if (!e.trim()) {
      a("Bitte Text markieren.", !1);
      return;
    }
    const t = await h(e),
      n = await m("/api/legal/risk-analysis", { text: t }),
      s = n.findings ?? [],
      r = n.overall_risk ?? "low",
      i = { low: "#22c55e", medium: "#f59e0b", high: "#ef4444", critical: "#dc2626" },
      o = document.getElementById("riskResult");
    ((o.innerHTML = `
      <div class="risk-overall" style="border-left:3px solid ${i[r]};padding:6px 8px;margin-bottom:8px;">
        Gesamtrisiko: <strong style="color:${i[r]}">${r.toUpperCase()}</strong>
      </div>
      ${s
        .map(
          (d) => `
        <div class="risk-item" style="border-left:3px solid ${i[d.severity]};padding:6px 8px;margin-bottom:6px;background:#0d0d1a;border-radius:4px;">
          <div style="font-weight:600;font-size:12px;color:${i[d.severity]}">${f(d.category)}</div>
          <div style="font-size:12px;margin:2px 0">${f(d.description)}</div>
          ${d.clause ? `<div style="font-size:11px;color:#8a8aa8">Klausel: ${f(d.clause)}</div>` : ""}
          <div style="font-size:11px;color:#a0a0c0;margin-top:3px">→ ${f(d.recommendation)}</div>
        </div>
      `
        )
        .join("")}
    `),
      (o.style.display = "block"));
  } catch (e) {
    a(e instanceof Error ? e.message : "Risikoanalyse fehlgeschlagen.", !1);
  } finally {
    l("riskBtn", !1, "Risiken prüfen");
  }
}
async function ee() {
  const e = document.getElementById("subsumptionFacts").value.trim(),
    t = document.getElementById("subsumptionQuestion").value.trim(),
    n = document.getElementById("subsumptionJurisdiction").value;
  if (!e || !t) {
    a("Bitte Sachverhalt und Rechtsfrage eingeben.", !1);
    return;
  }
  (l("subsumptionBtn", !0, "Prüfen"),
    p("subsumptionResult"),
    (document.getElementById("insertSubsumptionBtn").style.display = "none"));
  try {
    const s = await h(e),
      r = await m("/api/legal/subsumption", {
        scenario: `${s}

Rechtsfrage: ${t}`,
        jurisdiction: n,
      }),
      i = r.subsumption ?? r.text ?? r.markdown ?? "Keine Subsumtion zurückgegeben.";
    ((A = i),
      E("subsumptionResult", i, !0),
      (document.getElementById("insertSubsumptionBtn").style.display = "block"));
  } catch (s) {
    a(s instanceof Error ? s.message : "Subsumption fehlgeschlagen.", !1);
  } finally {
    l("subsumptionBtn", !1, "Prüfen");
  }
}
async function te() {
  if (!A) {
    a("Zuerst Subsumption prüfen.", !1);
    return;
  }
  try {
    (await B(A), a("Subsumption in Word eingefügt.", !0));
  } catch (e) {
    a(e instanceof Error ? e.message : "Einfügen fehlgeschlagen.", !1);
  }
}
async function ne() {
  (l("draftBtn", !0, "Entwurf erstellen"), p("draftResult"));
  try {
    const e = document.getElementById("draftInstruction").value.trim(),
      t = document.getElementById("draftTemplate").value;
    let n = "";
    try {
      n = await w();
    } catch {}
    const s = n ? await h(n) : void 0,
      r = await m("/api/legal/contract-draft", {
        context: s || void 0,
        instruction: e || t || "Erstelle einen vollständigen Vertrag",
        template_type: t || void 0,
      }),
      i = r.text ?? r.markdown ?? "";
    (E("draftResult", i, !0), (document.getElementById("insertDraftBtn").style.display = "block"));
  } catch (e) {
    a(e instanceof Error ? e.message : "Entwurf fehlgeschlagen.", !1, "contractStatus");
  } finally {
    l("draftBtn", !1, "Entwurf erstellen");
  }
}
async function se() {
  const e = document.getElementById("draftResult");
  if (!(e != null && e.dataset.raw)) {
    a("Zuerst Entwurf generieren.", !1, "contractStatus");
    return;
  }
  try {
    (await B(e.dataset.raw), a("Vertragsentwurf in Word eingefügt.", !0, "contractStatus"));
  } catch (t) {
    a(t instanceof Error ? t.message : "Einfügen fehlgeschlagen.", !1, "contractStatus");
  }
}
async function ae() {
  (l("redlineBtn", !0, "Redline erstellen"), p("redlineResult"));
  try {
    const e = document.getElementById("redlineInstruction").value.trim(),
      t = await w();
    if (!t.trim()) {
      a("Bitte Original-Text markieren.", !1, "contractStatus");
      return;
    }
    const n = await h(t),
      s = await m("/api/legal/contract-redline", {
        original: n,
        instruction: e || "Überprüfe und verbessere diesen Vertrag",
      }),
      r = s.redlined ?? s.text ?? s.summary ?? "",
      i = s.changes ?? [],
      o = document.getElementById("redlineResult");
    ((o.dataset.raw = r),
      (o.innerHTML = `
      <div style="font-size:11px;color:#8a8aa8;margin-bottom:6px">${i.length} Änderungen identifiziert</div>
      <div style="font-size:12px;line-height:1.5">${f(r).replace(/\n/g, "<br>")}</div>
    `),
      (o.style.display = "block"),
      (document.getElementById("insertRedlineBtn").style.display = "block"));
  } catch (e) {
    a(e instanceof Error ? e.message : "Redline fehlgeschlagen.", !1, "contractStatus");
  } finally {
    l("redlineBtn", !1, "Redline erstellen");
  }
}
async function re() {
  const e = document.getElementById("redlineResult");
  if (!(e != null && e.dataset.raw)) {
    a("Zuerst Redline generieren.", !1, "contractStatus");
    return;
  }
  const t = document.getElementById("trackChangesMode").value === "on";
  try {
    (await W(e.dataset.raw, t),
      a(
        t ? "Redline mit Track Changes eingefügt." : "Redline in Word eingefügt.",
        !0,
        "contractStatus"
      ));
  } catch (n) {
    a(n instanceof Error ? n.message : "Einfügen fehlgeschlagen.", !1, "contractStatus");
  }
}
async function ie(e) {
  const t = document.getElementById("textManipInstruction").value.trim();
  try {
    const n = await w();
    if (!n.trim()) {
      a("Bitte Passage in Word markieren.", !1, "contractStatus");
      return;
    }
    const s = await h(n),
      r =
        e === "kuerzen"
          ? "Kürze den folgenden Text auf das Wesentliche, behalte die Kernargumente bei."
          : e === "erweitern"
            ? "Erweitere den folgenden Text um zusätzliche Argumente, Beispiele und rechtliche Untermauerung."
            : "Strukturiere den folgenden Text neu: klare Absätze, logische Reihenfolge, Zwischenüberschriften wo sinnvoll.",
      i = t ? `${r} Zusätzliche Anweisung: ${t}` : r,
      o = await m("/api/legal/contract-redline", { original: s, instruction: i }),
      d = o.redlined ?? o.text ?? o.summary ?? "";
    P = d;
    const g = document.getElementById("textManipResult");
    ((g.dataset.raw = d),
      (g.innerHTML = `<div style="font-size:12px;line-height:1.5">${f(d).replace(/\n/g, "<br>")}</div>`),
      (g.style.display = "block"),
      (document.getElementById("insertTextManipBtn").style.display = "block"));
  } catch (n) {
    a(n instanceof Error ? n.message : "Text-Bearbeitung fehlgeschlagen.", !1, "contractStatus");
  }
}
async function oe() {
  if (!P) {
    a("Zuerst Text bearbeiten.", !1, "contractStatus");
    return;
  }
  const e = document.getElementById("trackChangesMode").value === "on";
  try {
    (await W(P, e),
      a(e ? "Mit Track Changes eingefügt." : "In Word eingefügt.", !0, "contractStatus"));
  } catch (t) {
    a(t instanceof Error ? t.message : "Einfügen fehlgeschlagen.", !1, "contractStatus");
  }
}
async function ce() {
  const e = document.getElementById("schriftsatzCaseSelect").value,
    t = document.getElementById("schriftsatzType").value,
    n = document.getElementById("schriftsatzJurisdiction").value,
    s = document.getElementById("schriftsatzCourt").value.trim(),
    r = document.getElementById("schriftsatzFileNumber").value.trim(),
    i = document.getElementById("schriftsatzInstructions").value.trim();
  if (!e) {
    a("Bitte Akte auswählen.", !1, "contractStatus");
    return;
  }
  if (!i) {
    a("Bitte Anweisungen/Sachverhalt eingeben.", !1, "contractStatus");
    return;
  }
  (l("schriftsatzBtn", !0, "Schriftsatz generieren"),
    p("schriftsatzResult"),
    (document.getElementById("insertSchriftsatzBtn").style.display = "none"));
  try {
    const o = await h(i),
      d = await m("/api/legal/schriftsatz", {
        case_slug: e,
        document_type: t,
        court: s || void 0,
        file_number: r || void 0,
        instructions: o,
        jurisdiction: n,
        language: "de",
      }),
      g = d.text ?? d.markdown ?? d.document ?? d.content ?? "";
    ((C = g),
      E("schriftsatzResult", g, !0),
      (document.getElementById("insertSchriftsatzBtn").style.display = "block"));
  } catch (o) {
    a(
      o instanceof Error ? o.message : "Schriftsatz-Generierung fehlgeschlagen.",
      !1,
      "contractStatus"
    );
  } finally {
    l("schriftsatzBtn", !1, "Schriftsatz generieren");
  }
}
async function le() {
  if (!C) {
    a("Zuerst Schriftsatz generieren.", !1, "contractStatus");
    return;
  }
  try {
    (await B(C), a("Schriftsatz in Word eingefügt.", !0, "contractStatus"));
  } catch (e) {
    a(e instanceof Error ? e.message : "Einfügen fehlgeschlagen.", !1, "contractStatus");
  }
}
async function ue() {
  const e = document.getElementById("contextCaseSelect").value;
  if (!e) {
    a("Bitte Akte auswählen.", !1, "akteStatus");
    return;
  }
  (l("contextBtn", !0, "Laden"), p("contextResult"));
  try {
    const t = await I(`/api/matter-context/${encodeURIComponent(e)}/understanding`);
    E("contextResult", t.understanding ?? t.summary ?? t.facts ?? "Kein Kontext verfügbar.");
  } catch (t) {
    a(t instanceof Error ? t.message : "Kontext-Abruf fehlgeschlagen.", !1, "akteStatus");
  } finally {
    l("contextBtn", !1, "Akten-Kontext laden");
  }
}
async function de() {
  const e = document.getElementById("chronoCaseSelect").value;
  if (!e) {
    a("Bitte Akte auswählen.", !1, "akteStatus");
    return;
  }
  l("chronoBtn", !0, "Generiere…");
  try {
    const t = await m("/api/legal/chronology", { case_slug: e });
    (await B(t.markdown ?? ""),
      a(`Chronologie mit ${t.count ?? "?"} Einträgen eingefügt.`, !0, "akteStatus"));
  } catch (t) {
    a(t instanceof Error ? t.message : "Chronologie fehlgeschlagen.", !1, "akteStatus");
  } finally {
    l("chronoBtn", !1, "Chronologie einfügen");
  }
}
async function fe() {
  const e = document.getElementById("pipelineCaseSelect").value;
  if (!e) {
    a("Bitte Akte auswählen.", !1, "akteStatus");
    return;
  }
  l("pipelineBtn", !0, "Starte…");
  try {
    const t = await m("/api/pipeline/start", { case_slug: e });
    a(`Pipeline gestartet: ${t.status ?? "ok"}`, !0, "akteStatus");
  } catch (t) {
    a(t instanceof Error ? t.message : "Pipeline-Start fehlgeschlagen.", !1, "akteStatus");
  } finally {
    l("pipelineBtn", !1, "Pipeline starten");
  }
}
async function ge() {
  const e = document.getElementById("exportSlug").value.trim();
  if (!e) {
    a("Bitte Page Slug eingeben.", !1, "exportStatus");
    return;
  }
  l("exportBtn", !0, "Exportiere…");
  try {
    const t = await fetch(`${z}/api/word-export`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${y}` },
      body: JSON.stringify({ slug: e }),
    });
    if (!t.ok) throw new Error(`HTTP ${t.status}`);
    const n = await t.blob(),
      s = URL.createObjectURL(n),
      r = document.createElement("a");
    ((r.href = s),
      (r.download = `${e}.docx`),
      r.click(),
      URL.revokeObjectURL(s),
      a("Word-Dokument heruntergeladen.", !0, "exportStatus"));
  } catch (t) {
    a(t instanceof Error ? t.message : "Export fehlgeschlagen.", !1, "exportStatus");
  } finally {
    l("exportBtn", !1, ".docx herunterladen");
  }
}
async function me() {
  const e = document.getElementById("saveTitle").value.trim(),
    t = document.getElementById("saveCaseSelect").value;
  l("saveBtn", !0, "Speichern…");
  try {
    let n = "";
    try {
      n = await w();
    } catch {
      n = "";
    }
    if (!n.trim()) {
      a("Bitte Text markieren der gespeichert werden soll.", !1, "exportStatus");
      return;
    }
    (await K(e || "Word-Dokument", n, t || void 0),
      a("Über die Dokument-Pipeline gespeichert.", !0, "exportStatus"));
  } catch (n) {
    a(n instanceof Error ? n.message : "Speichern fehlgeschlagen.", !1, "exportStatus");
  } finally {
    l("saveBtn", !1, "Als Brain-Page speichern");
  }
}
async function ye() {
  (l("analyzeFullBtn", !0, "Gesamtes Dokument analysieren"), p("fullDocResult"));
  try {
    const e = await j();
    if (!e.trim()) {
      a("Dokument ist leer.", !1, "exportStatus");
      return;
    }
    const t = e.slice(0, 5e4),
      n = await h(t),
      s = await m("/api/legal/analyze", { text: n, mode: "contract" });
    E("fullDocResult", s.summary ?? s.text ?? "Keine Analyse zurückgegeben.");
  } catch (e) {
    a(e instanceof Error ? e.message : "Ganztex-Analyse fehlgeschlagen.", !1, "exportStatus");
  } finally {
    l("analyzeFullBtn", !1, "Gesamtes Dokument analysieren");
  }
}
function he() {
  ((b = !b), document.getElementById("pseudonymizeToggle").classList.toggle("on", b), O());
  try {
    localStorage.setItem("subsumio_pseudonymize", b ? "1" : "0");
  } catch {}
}
function O() {
  const e = document.getElementById("connectedSince"),
    t = document.getElementById("tokenDisplay"),
    n = document.getElementById("pseudonymizeStatus");
  if (((e.textContent = T ? T.toLocaleTimeString("de-DE") : "—"), y)) {
    const s = y.length > 12 ? `${y.slice(0, 8)}…${y.slice(-4)}` : "••••";
    t.textContent = s;
  } else t.textContent = "—";
  n.textContent = b ? "Aktiv" : "Inaktiv";
}
function E(e, t, n = !1) {
  const s = document.getElementById(e);
  s &&
    (n && (s.dataset.raw = t),
    s.classList.add("fade-in"),
    (s.innerHTML = `<div style="font-size:12px;line-height:1.6;color:#c0c0d8;white-space:pre-wrap">${f(t).replace(/\n/g, "<br>")}</div>`),
    (s.style.display = "block"));
}
function p(e) {
  const t = document.getElementById(e);
  t && ((t.innerHTML = ""), (t.style.display = "none"), delete t.dataset.raw);
}
Office.onReady(() => {
  try {
    if (localStorage.getItem("subsumio_pseudonymize") === "0") {
      b = !1;
      const n = document.getElementById("pseudonymizeToggle");
      n == null || n.classList.remove("on");
    }
  } catch {}
  document.querySelectorAll(".tab-btn").forEach((t) => {
    t.addEventListener("click", () => L(t.getAttribute("data-tab") ?? "recherche"));
  });
  const e = document.getElementById("rechercheQuery");
  (e &&
    e.addEventListener("keydown", (t) => {
      t.key === "Enter" && (t.metaKey || t.ctrlKey) && (t.preventDefault(), D());
    }),
    L("recherche"));
});
const u = window;
u.connect = F;
u.disconnect = Z;
u.copyToken = _;
u.switchTab = L;
u.togglePseudonymize = he;
u.runRecherche = D;
u.insertRechercheAnswer = J;
u.insertAllSourcesAsEndnotes = N;
u.analyzeSelection = Q;
u.summarizeSelection = V;
u.extractObligations = X;
u.checkRisks = Y;
u.runSubsumption = ee;
u.insertSubsumptionIntoWord = te;
u.draftContract = ne;
u.insertDraftIntoWord = se;
u.redlineContract = ae;
u.insertRedlineIntoWord = re;
u.textManip = ie;
u.insertTextManipIntoWord = oe;
u.generateSchriftsatz = ce;
u.insertSchriftsatzIntoWord = le;
u.loadCaseContext = ue;
u.insertChronology = de;
u.triggerPipeline = fe;
u.exportDocx = ge;
u.saveAsBrainPage = me;
u.analyzeFullDocument = ye;
