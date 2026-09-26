import { sanitizeFilename } from "@/lib/upload-validation";

function safePath(name: string): string {
  const clean = sanitizeFilename(name).slice(0, 180) || "dokument";
  return `dokumente/${clean}`;
}

/**
 * ZIP-Pfad, der noch nicht vergeben ist. Gleichnamige Dateien bekommen einen
 * Zähler vor der Endung (`scan.pdf`, `scan_1.pdf`, `scan_2.pdf`, …) — jede
 * Runde erzeugt einen neuen Namen, die Schleife endet also immer.
 */
export function uniqueZipPath(name: string, used: Set<string>): string {
  const first = safePath(name);
  if (!used.has(first)) return first;
  const file = first.slice("dokumente/".length);
  const dot = file.lastIndexOf(".");
  const base = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot) : "";
  for (let n = 1; ; n++) {
    const candidate = `dokumente/${base.slice(0, 170)}_${n}${ext}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * Liest den Antwortkörper höchstens bis `max` Bytes. Größere Dateien werden
 * abgebrochen, bevor sie vollständig im Speicher liegen (null = zu groß).
 */
export async function readCapped(res: Response, max: number): Promise<Buffer | null> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.byteLength > max ? null : buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
