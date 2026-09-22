"use client";

/**
 * Mobile: „An Subsumio senden" (Android Share-Target, WP-4.22).
 * Empfängt geteilten Text/URLs (?text=&subject=) und Datei-Streams
 * (?stream=content://…) vom nativen Intent-Filter — speichert Text als
 * Brain-Notiz bzw. lädt Dateien in die gewählte Akte.
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, FileUp, FolderOpen, Loader2, Save, X } from "lucide-react";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";

function base64ToFile(base64: string, name: string): File {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name || "geteilte-datei");
}

function MobileShareInner() {
  const params = useSearchParams();
  const sharedText = params.get("text") ?? "";
  const sharedSubject = params.get("subject") ?? "";
  const streamUri = params.get("stream") ?? "";
  const streamName = params.get("name") ?? "geteilte-datei";

  const [text, setText] = useState(sharedText);
  const [matter, setMatter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [fileData, setFileData] = useState<File | null>(null);
  const [cases, setCases] = useState<Array<{ slug: string; title: string }>>([]);

  // Datei-Stream (content://) via Capacitor-Filesystem lesen.
  useEffect(() => {
    if (!streamUri) return;
    let cancelled = false;
    (async () => {
      try {
        const { Filesystem } = await import("@capacitor/filesystem");
        const res = await Filesystem.readFile({ path: streamUri });
        const base64 =
          typeof res.data === "string" ? res.data : await blobToBase64(res.data as Blob);
        const f = base64ToFile(base64, streamName);
        if (cancelled) return;
        setFileData(f);
        setFileInfo({ name: f.name, size: f.size });
      } catch {
        if (!cancelled)
          setError("Die geteilte Datei konnte nicht gelesen werden (nur in der nativen App).");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [streamUri, streamName]);

  // Aktenliste für die Zuordnung.
  useEffect(() => {
    api.brain
      .listPages({ type: "legal_case", limit: 200 })
      .then((pages) => setCases(pages.map((p) => ({ slug: p.slug, title: p.title })).slice(0, 200)))
      .catch(() => {});
  }, []);

  const saveText = useCallback(async () => {
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const title = sharedSubject || text.slice(0, 60) + (text.length > 60 ? "…" : "");
      const result = await api.brain.createPage({
        slug: `share-${Date.now()}`,
        title: `Geteilt: ${title}`,
        content: text,
        type: "note",
        frontmatter: {
          type: "note",
          created_at: new Date().toISOString(),
          matter: matter || undefined,
          source: "mobile_share",
        },
      });
      setDone(result.slug);
    } catch {
      setError("Speichern fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setSaving(false);
    }
  }, [text, matter, sharedSubject]);

  const saveFile = useCallback(async () => {
    if (!fileData) return;
    if (!matter) {
      setError("Bitte eine Akte für den Datei-Upload auswählen.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", fileData);
      fd.append("case_slug", matter);
      fd.append("source", "legal_case");
      const res = await csrfFetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { slug?: string };
      setDone(data.slug ?? matter);
    } catch {
      setError("Datei-Upload fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setSaving(false);
    }
  }, [fileData, matter]);

  if (done) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: 24,
          textAlign: "center",
        }}
      >
        <CheckCircle2 size={48} style={{ color: "var(--signal-success-500)", marginBottom: 16 }} />
        <div style={{ fontSize: 18, fontWeight: 600, color: "var(--ds-text)", marginBottom: 8 }}>
          {fileData ? "Datei abgelegt" : "Notiz gespeichert"}
        </div>
        <a
          href="/mobile"
          style={{
            marginTop: 20,
            padding: "10px 20px",
            background: "var(--brand-500)",
            borderRadius: 10,
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Zur Übersicht
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          padding: "14px 16px 12px",
          background: "var(--ds-surface)",
          borderBottom: "1px solid var(--ds-border)",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--ds-text)" }}>
          An Subsumio senden
        </h1>
        <p style={{ fontSize: 12, color: "var(--ds-text-muted)", marginTop: 2 }}>
          {fileInfo ? "Datei in Akte ablegen" : "Geteilten Inhalt als Notiz speichern"}
        </p>
      </div>

      <div
        style={{
          flex: 1,
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflowY: "auto",
        }}
      >
        {fileInfo && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              background: "var(--ds-surface-2)",
              border: "1px solid var(--ds-border)",
              borderRadius: 12,
            }}
          >
            <FileUp size={18} style={{ color: "var(--brand-500)", flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--ds-text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {fileInfo.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--ds-text-subtle)" }}>
                {(fileInfo.size / 1024).toFixed(0)} KB
              </div>
            </div>
          </div>
        )}

        {!fileInfo && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Geteilter Text…"
            rows={8}
            style={{
              width: "100%",
              background: "var(--ds-surface-2)",
              border: "1px solid var(--ds-border)",
              borderRadius: 12,
              padding: "12px 14px",
              color: "var(--ds-text)",
              fontSize: 15,
              lineHeight: 1.6,
              resize: "none",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        )}

        <div>
          <label
            htmlFor="share-matter"
            style={{
              fontSize: 11,
              color: "var(--ds-text-muted)",
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 5,
            }}
          >
            <FolderOpen size={12} /> Akte {fileInfo ? "" : "(optional)"}
          </label>
          <select
            id="share-matter"
            value={matter}
            onChange={(e) => setMatter(e.target.value)}
            style={{
              width: "100%",
              background: "var(--ds-surface-2)",
              border: "1px solid var(--ds-border)",
              borderRadius: 10,
              padding: "9px 12px",
              color: "var(--ds-text)",
              fontSize: 14,
              outline: "none",
              boxSizing: "border-box",
            }}
          >
            <option value="">{fileInfo ? "Akte wählen…" : "Keine Zuordnung"}</option>
            {cases.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--ds-danger-bg)",
              border: "1px solid var(--ds-danger-border)",
              borderRadius: 8,
              padding: "8px 12px",
            }}
          >
            <X size={14} style={{ color: "var(--signal-danger-500)" }} />
            <span style={{ fontSize: 13, color: "var(--signal-danger-500)" }}>{error}</span>
          </div>
        )}

        <button
          onClick={fileData ? saveFile : saveText}
          disabled={saving || (!fileData && !text.trim()) || (fileData !== null && !matter)}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: 14,
            background: fileData || text.trim() ? "var(--brand-500)" : "var(--ds-border)",
            border: "none",
            color: fileData || text.trim() ? "#fff" : "var(--ds-text-muted)",
            fontSize: 15,
            fontWeight: 600,
            cursor: fileData || text.trim() ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {saving ? (
            <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <Save size={18} />
          )}
          {saving ? "Speichern…" : fileData ? "In Akte ablegen" : "Als Notiz speichern"}
        </button>
      </div>
      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(bin);
}

export default function MobileSharePage() {
  return (
    <Suspense fallback={null}>
      <MobileShareInner />
    </Suspense>
  );
}
