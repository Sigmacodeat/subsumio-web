import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { withRetry } from "@/lib/retry";
import { scanFile } from "@/lib/virus-scan";
import { env } from "@/lib/env";
import type { WhatsAppMediaMessage } from "./types";

export interface StoredWhatsAppMedia {
  provider: "whatsapp";
  mediaId: string;
  kind: WhatsAppMediaMessage["type"];
  mimeType: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
  storageProvider: "local";
  storagePath: string;
  graphUrlExpiresQuickly: boolean;
}

interface MediaUrlResponse {
  url?: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
  id?: string;
}

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

function graphVersion(): string {
  return env("WHATSAPP_GRAPH_VERSION") || "v20.0";
}

function maxBytes(): number {
  const raw = Number(env("WHATSAPP_MEDIA_MAX_BYTES"));
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_BYTES;
}

function storageDir(): string {
  return (
    env("WHATSAPP_MEDIA_STORAGE_DIR") || path.join(process.cwd(), ".data", "whatsapp-media")
  );
}

function extensionFromMime(mimeType: string, fallback = "bin"): string {
  const subtype = mimeType.split("/")[1]?.split(";")[0]?.trim().toLowerCase();
  if (!subtype) return fallback;
  if (subtype === "jpeg") return "jpg";
  if (subtype === "plain") return "txt";
  if (subtype.includes("mpeg")) return "mp3";
  return subtype.replace(/[^a-z0-9]+/g, "") || fallback;
}

function safeFilename(input: string): string {
  return (
    input
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "whatsapp-media"
  );
}

async function getMediaUrl(mediaId: string): Promise<MediaUrlResponse> {
  const token = env("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN fehlt.");
  const params = new URLSearchParams();
  if (phoneNumberId) params.set("phone_number_id", phoneNumberId);
  const qs = params.toString();
  const res = await withRetry(() =>
    fetch(
      `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(mediaId)}${qs ? `?${qs}` : ""}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )
  );
  if (!res.ok) {
    const error = await res.text().catch(() => "");
    throw new Error(error || `WhatsApp Media URL failed: HTTP ${res.status}`);
  }
  return res.json() as Promise<MediaUrlResponse>;
}

export async function downloadAndStoreWhatsAppMedia(
  message: WhatsAppMediaMessage
): Promise<StoredWhatsAppMedia> {
  const token = env("WHATSAPP_ACCESS_TOKEN");
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN fehlt.");

  const meta = await getMediaUrl(message.mediaId);
  if (!meta.url) throw new Error("WhatsApp Media API lieferte keine Download-URL.");
  const downloadUrl = meta.url;
  const expectedSize = Number(meta.file_size || 0);
  if (expectedSize > maxBytes())
    throw new Error(
      `WhatsApp-Medium ist zu groß (${expectedSize} Bytes). Limit: ${maxBytes()} Bytes.`
    );

  const res = await withRetry(() =>
    fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } })
  );
  if (!res.ok) {
    const error = await res.text().catch(() => "");
    throw new Error(error || `WhatsApp media download failed: HTTP ${res.status}`);
  }

  const arrayBuf = await res.arrayBuffer();
  const bytes = Buffer.from(arrayBuf);
  if (bytes.length > maxBytes())
    throw new Error(
      `WhatsApp-Medium ist zu groß (${bytes.length} Bytes). Limit: ${maxBytes()} Bytes.`
    );

  const mimeType =
    meta.mime_type ||
    message.mimeType ||
    res.headers.get("content-type") ||
    "application/octet-stream";

  // P0-SEC-002: WhatsApp media is untrusted inbound bytes — scan before storing.
  const scan = await scanFile(arrayBuf, mimeType);
  if (!scan.ok) {
    const detail =
      scan.reason === "executable_detected"
        ? `ausführbare Datei (${scan.label})`
        : scan.reason === "mime_mismatch"
          ? `Dateiinhalt passt nicht zum Typ (${scan.expected})`
          : scan.reason === "clamav_infected"
            ? `Malware erkannt (${scan.signature})`
            : "Virenscanner nicht erreichbar";
    throw new Error(`WhatsApp-Medium abgelehnt: ${detail}.`);
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  const ext = extensionFromMime(mimeType);
  const filename = safeFilename(
    message.filename || `whatsapp-${message.type}-${message.mediaId}.${ext}`
  );
  const date = new Date().toISOString().slice(0, 10);
  const relativePath = path.posix.join(date, `${hash.slice(0, 16)}-${filename}`);
  const absolutePath = path.join(storageDir(), relativePath);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, bytes, { flag: "wx" }).catch(async (err: NodeJS.ErrnoException) => {
    if (err.code !== "EEXIST") throw err;
  });

  return {
    provider: "whatsapp",
    mediaId: message.mediaId,
    kind: message.type,
    mimeType,
    filename,
    sizeBytes: bytes.length,
    sha256: hash,
    storageProvider: "local",
    storagePath: absolutePath,
    graphUrlExpiresQuickly: true,
  };
}
