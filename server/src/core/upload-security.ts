import { extname } from "node:path";
import { connect } from "node:net";
import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";

export type UploadSecurityResult = { ok: true } | { ok: false; code: string; message: string };

const EXECUTABLES: Array<{ bytes: number[]; label: string }> = [
  { bytes: [0x4d, 0x5a], label: "Windows executable" },
  { bytes: [0x7f, 0x45, 0x4c, 0x46], label: "ELF executable" },
  { bytes: [0xcf, 0xfa, 0xed, 0xfe], label: "Mach-O executable" },
  { bytes: [0xfe, 0xed, 0xfa, 0xcf], label: "Mach-O executable" },
  { bytes: [0xca, 0xfe, 0xba, 0xbe], label: "Java class / universal binary" },
];

const MAGIC_BY_EXT: Record<string, number[][]> = {
  ".pdf": [[0x25, 0x50, 0x44, 0x46]],
  ".png": [[0x89, 0x50, 0x4e, 0x47]],
  ".jpg": [[0xff, 0xd8, 0xff]],
  ".jpeg": [[0xff, 0xd8, 0xff]],
  ".gif": [[0x47, 0x49, 0x46, 0x38]],
  ".bmp": [[0x42, 0x4d]],
  ".rtf": [[0x7b, 0x5c, 0x72, 0x74, 0x66]],
  ".ogg": [[0x4f, 0x67, 0x67, 0x53]],
  ".flac": [[0x66, 0x4c, 0x61, 0x43]],
  ".tif": [
    [0x49, 0x49, 0x2a, 0x00],
    [0x4d, 0x4d, 0x00, 0x2a],
  ],
  ".tiff": [
    [0x49, 0x49, 0x2a, 0x00],
    [0x4d, 0x4d, 0x00, 0x2a],
  ],
  ".zip": [[0x50, 0x4b]],
  // Password-encrypted OOXML is wrapped in an OLE compound container.
  ".docx": [
    [0x50, 0x4b],
    [0xd0, 0xcf, 0x11, 0xe0],
  ],
  ".docm": [
    [0x50, 0x4b],
    [0xd0, 0xcf, 0x11, 0xe0],
  ],
  ".xlsx": [
    [0x50, 0x4b],
    [0xd0, 0xcf, 0x11, 0xe0],
  ],
  ".xlsm": [
    [0x50, 0x4b],
    [0xd0, 0xcf, 0x11, 0xe0],
  ],
  ".pptx": [
    [0x50, 0x4b],
    [0xd0, 0xcf, 0x11, 0xe0],
  ],
  ".pptm": [
    [0x50, 0x4b],
    [0xd0, 0xcf, 0x11, 0xe0],
  ],
  ".odt": [[0x50, 0x4b]],
  ".ods": [[0x50, 0x4b]],
  ".odp": [[0x50, 0x4b]],
  ".pages": [[0x50, 0x4b]],
  ".key": [[0x50, 0x4b]],
  ".numbers": [[0x50, 0x4b]],
  ".doc": [[0xd0, 0xcf, 0x11, 0xe0]],
  ".xls": [[0xd0, 0xcf, 0x11, 0xe0]],
  ".ppt": [[0xd0, 0xcf, 0x11, 0xe0]],
  ".msg": [[0xd0, 0xcf, 0x11, 0xe0]],
  ".pst": [[0x21, 0x42, 0x44, 0x4e]],
};

function startsWith(data: Buffer, signature: number[]): boolean {
  return signature.every((byte, index) => data[index] === byte);
}

function asciiAt(data: Buffer, offset: number, text: string): boolean {
  return (
    data.length >= offset + text.length &&
    data.subarray(offset, offset + text.length).toString("ascii") === text
  );
}

function matchesSpecialContainer(ext: string, data: Buffer): boolean | undefined {
  if (ext === ".webp") return asciiAt(data, 0, "RIFF") && asciiAt(data, 8, "WEBP");
  if (ext === ".wav") return asciiAt(data, 0, "RIFF") && asciiAt(data, 8, "WAVE");
  if (ext === ".mp3") {
    return (
      asciiAt(data, 0, "ID3") || (data.length >= 2 && data[0] === 0xff && (data[1] & 0xe0) === 0xe0)
    );
  }
  if ([".m4a", ".mp4", ".heic", ".heif", ".avif"].includes(ext)) {
    if (!asciiAt(data, 4, "ftyp")) return false;
    const brands = data.subarray(8, Math.min(data.length, 32)).toString("ascii").toLowerCase();
    if (ext === ".avif") return brands.includes("avif") || brands.includes("avis");
    if (ext === ".heic" || ext === ".heif") {
      return ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].some((brand) =>
        brands.includes(brand)
      );
    }
    return true;
  }
  return undefined;
}

/** clamd's INSTREAM ceiling (`StreamMaxLength`); 25 MB is clamd's own default. */
const DEFAULT_CLAMAV_STREAM_MAX_BYTES = 25 * 1024 * 1024;
const INSTREAM_CHUNK_BYTES = 64 * 1024;

/**
 * Largest file the scanner accepts via INSTREAM. Set CLAMAV_STREAM_MAX_BYTES to
 * the clamd `StreamMaxLength` of the deployment (the netcup compose raises it
 * to 500 MB); anything larger is refused BEFORE the upload is accepted —
 * never waved through unscanned.
 */
export function clamAvStreamMaxBytes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.CLAMAV_STREAM_MAX_BYTES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_CLAMAV_STREAM_MAX_BYTES;
}

/** Path-based `SCAN` only works when clamd sees the engine's upload directory. */
function sharedPathScanEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(1|true|yes|on)$/i.test((env.CLAMAV_SHARED_PATH_SCAN ?? "").trim());
}

function tooLargeForScan(sizeBytes: number, limitBytes: number): UploadSecurityResult {
  const mb = (n: number) => Math.max(1, Math.round(n / (1024 * 1024)));
  return {
    ok: false,
    code: "file_too_large_for_scan",
    message: `Die Datei (${mb(sizeBytes)} MB) überschreitet die Prüfgrenze des Virenscanners (${mb(limitBytes)} MB) und wurde abgelehnt.`,
  };
}

const SCANNER_UNAVAILABLE: UploadSecurityResult = {
  ok: false,
  code: "scanner_unavailable",
  message: "Virenscanner nicht erreichbar.",
};

/** Map clamd's reply line to a result. Anything unrecognised fails closed. */
function interpretClamResponse(response: string): UploadSecurityResult {
  if (/size limit exceeded/i.test(response)) {
    return {
      ok: false,
      code: "file_too_large_for_scan",
      message:
        "Die Datei überschreitet die Prüfgrenze des Virenscanners (StreamMaxLength) und wurde abgelehnt.",
    };
  }
  if (response.includes("FOUND")) {
    return {
      ok: false,
      code: "malware_detected",
      message: "Schadsoftware erkannt — Upload abgelehnt.",
    };
  }
  if (response.includes("OK")) return { ok: true };
  return {
    ok: false,
    code: "scanner_unavailable",
    message: "Virenscanner lieferte keine gültige Antwort.",
  };
}

/**
 * Stream content to clamd with INSTREAM. The scanner never needs to see the
 * file on its own filesystem, so this works across container boundaries
 * (clamd runs as its own compose service without a shared upload volume).
 */
async function scanClamAvInstream(
  chunks: AsyncIterable<Buffer | Uint8Array> | Iterable<Buffer | Uint8Array>,
  target: string,
  timeoutMs: number
): Promise<UploadSecurityResult> {
  const [hostname, portText] = target.split(":");
  const port = Number(portText || "3310");
  return new Promise((resolve) => {
    const socket = connect(port, hostname);
    let response = "";
    let settled = false;
    const finish = (result: UploadSecurityResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };
    const timer = setTimeout(() => finish(SCANNER_UNAVAILABLE), timeoutMs);
    // Respect backpressure: a large file must not be buffered into the socket.
    const write = (buf: Buffer) =>
      new Promise<void>((done) => {
        if (socket.destroyed) return done();
        if (socket.write(buf)) done();
        else socket.once("drain", () => done());
      });
    socket.on("connect", () => {
      void (async () => {
        try {
          await write(Buffer.from("zINSTREAM\0"));
          for await (const raw of chunks) {
            const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
            for (let offset = 0; offset < chunk.length; offset += INSTREAM_CHUNK_BYTES) {
              const slice = chunk.subarray(
                offset,
                Math.min(offset + INSTREAM_CHUNK_BYTES, chunk.length)
              );
              const length = Buffer.alloc(4);
              length.writeUInt32BE(slice.length);
              await write(length);
              await write(slice);
            }
          }
          await write(Buffer.alloc(4));
        } catch {
          finish(SCANNER_UNAVAILABLE);
        }
      })();
    });
    socket.on("data", (chunk) => (response += chunk.toString("utf8")));
    socket.on("end", () => finish(interpretClamResponse(response)));
    socket.on("error", () =>
      finish({ ok: false, code: "scanner_unavailable", message: "Virenscanner nicht erreichbar." })
    );
  });
}

/** Engine-side defense used by every multipart upload path. */
export async function inspectUploadBytes(
  filename: string,
  data: Buffer
): Promise<UploadSecurityResult> {
  if (data.length === 0) return { ok: false, code: "empty_file", message: "Die Datei ist leer." };
  for (const signature of EXECUTABLES) {
    if (startsWith(data, signature.bytes)) {
      return {
        ok: false,
        code: "executable_detected",
        message: `${signature.label} erkannt — Upload abgelehnt.`,
      };
    }
  }
  const ext = extname(filename).toLowerCase();
  const specialMatch = matchesSpecialContainer(ext, data);
  if (specialMatch === false) {
    return {
      ok: false,
      code: "content_type_mismatch",
      message: "Dateiendung und tatsächlicher Dateiinhalt stimmen nicht überein.",
    };
  }
  const expected = MAGIC_BY_EXT[ext];
  if (expected && !expected.some((signature) => startsWith(data, signature))) {
    return {
      ok: false,
      code: "content_type_mismatch",
      message: "Dateiendung und tatsächlicher Dateiinhalt stimmen nicht überein.",
    };
  }
  const clamAv = process.env.CLAMAV_HOST?.trim();
  if (!clamAv) return { ok: true };
  const limit = clamAvStreamMaxBytes();
  if (data.length > limit) return tooLargeForScan(data.length, limit);
  return scanClamAvInstream([data], clamAv, 15_000);
}

/**
 * Scan a file by path using clamd's SCAN command — no buffer needed, but clamd
 * must see the same filesystem path (CLAMAV_SHARED_PATH_SCAN=1 attests that).
 */
async function scanClamAvByPath(filePath: string, target: string): Promise<UploadSecurityResult> {
  const [hostname, portText] = target.split(":");
  const port = Number(portText || "3310");
  return new Promise((resolve) => {
    const socket = connect(port, hostname);
    let response = "";
    let settled = false;
    const finish = (result: UploadSecurityResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };
    const timer = setTimeout(
      () =>
        finish({
          ok: false,
          code: "scanner_unavailable",
          message: "Virenscanner nicht erreichbar.",
        }),
      60_000
    );
    socket.on("connect", () => {
      socket.write(`SCAN ${filePath}\0`);
    });
    socket.on("data", (chunk) => (response += chunk.toString("utf8")));
    socket.on("end", () => finish(interpretClamResponse(response)));
    socket.on("error", () =>
      finish({ ok: false, code: "scanner_unavailable", message: "Virenscanner nicht erreichbar." })
    );
  });
}

/**
 * Inspect an uploaded file by path — checks magic bytes (reads only first 64 bytes)
 * and streams the file to ClamAV (INSTREAM, 64 KiB chunks with backpressure).
 * Does NOT buffer the entire file into memory. Files above the scanner's
 * stream limit are refused with `file_too_large_for_scan`.
 */
export async function inspectUploadFile(
  filename: string,
  filePath: string
): Promise<UploadSecurityResult> {
  // Read only the first 64 bytes for magic byte checks
  const handle = await open(filePath, "r");
  try {
    const buf = Buffer.alloc(64);
    const { bytesRead } = await handle.read(buf, 0, 64, 0);
    const header = buf.subarray(0, bytesRead);

    if (bytesRead === 0) return { ok: false, code: "empty_file", message: "Die Datei ist leer." };

    for (const signature of EXECUTABLES) {
      if (startsWith(header, signature.bytes)) {
        return {
          ok: false,
          code: "executable_detected",
          message: `${signature.label} erkannt — Upload abgelehnt.`,
        };
      }
    }
    const ext = extname(filename).toLowerCase();
    const specialMatch = matchesSpecialContainer(ext, header);
    if (specialMatch === false) {
      return {
        ok: false,
        code: "content_type_mismatch",
        message: "Dateiendung und tatsächlicher Dateiinhalt stimmen nicht überein.",
      };
    }
    const expected = MAGIC_BY_EXT[ext];
    if (expected && !expected.some((signature) => startsWith(header, signature))) {
      return {
        ok: false,
        code: "content_type_mismatch",
        message: "Dateiendung und tatsächlicher Dateiinhalt stimmen nicht überein.",
      };
    }
  } finally {
    await handle.close();
  }

  const clamAv = process.env.CLAMAV_HOST?.trim();
  if (!clamAv) return { ok: true };
  // Path-based SCAN only when the operator attests a shared upload volume;
  // otherwise clamd cannot see the path and every check would end as
  // "scanner unavailable" without a single real scan.
  if (sharedPathScanEnabled()) return scanClamAvByPath(filePath, clamAv);
  const { size } = await stat(filePath);
  const limit = clamAvStreamMaxBytes();
  if (size > limit) return tooLargeForScan(size, limit);
  return scanClamAvInstream(
    createReadStream(filePath, { highWaterMark: INSTREAM_CHUNK_BYTES }),
    clamAv,
    60_000
  );
}
