import { extname } from "node:path";
import { connect } from "node:net";

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

async function scanClamAv(data: Buffer, target: string): Promise<UploadSecurityResult> {
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
      15_000
    );
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < data.length; offset += 64 * 1024) {
        const chunk = data.subarray(offset, Math.min(offset + 64 * 1024, data.length));
        const length = Buffer.alloc(4);
        length.writeUInt32BE(chunk.length);
        socket.write(length);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", (chunk) => (response += chunk.toString("utf8")));
    socket.on("end", () => {
      if (response.includes("FOUND"))
        finish({
          ok: false,
          code: "malware_detected",
          message: "Schadsoftware erkannt — Upload abgelehnt.",
        });
      else if (response.includes("OK")) finish({ ok: true });
      else
        finish({
          ok: false,
          code: "scanner_unavailable",
          message: "Virenscanner lieferte keine gültige Antwort.",
        });
    });
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
  return clamAv ? scanClamAv(data, clamAv) : { ok: true };
}
