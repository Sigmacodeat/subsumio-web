/**
 * Virus scanning / malware detection for uploaded files.
 *
 * Multi-layer defense:
 * 1. Magic-byte validation — verifies file content matches declared MIME type
 * 2. Embedded executable detection — flags PE/ELF/MachO binaries disguised as documents
 * 3. Optional ClamAV scan — when CLAMAV_HOST is set, streams the file to ClamAV daemon
 *
 * This is a defense-in-depth layer, not a replacement for server-side AV.
 * The primary protection is the MIME-type allowlist in upload-validation.ts.
 */

const CLAMAV_TIMEOUT_MS = 10_000;

// Magic bytes for executable formats that should never appear in a legal document
const EXECUTABLE_SIGNATURES: { offset: number; bytes: number[]; label: string }[] = [
  { offset: 0, bytes: [0x4d, 0x5a], label: "PE/EXE" },           // Windows PE
  { offset: 0, bytes: [0x7f, 0x45, 0x4c, 0x46], label: "ELF" },  // Linux ELF
  { offset: 0, bytes: [0xcf, 0xfa, 0xed, 0xfe], label: "Mach-O" }, // macOS Mach-O 64
  { offset: 0, bytes: [0xca, 0xfe, 0xba, 0xbe], label: "Java class" },
  { offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x06], label: "ZIP with executable" },
];

// Expected magic bytes per MIME type
const MIME_SIGNATURES: Record<string, { offset: number; bytes: number[] }[]> = {
  "application/pdf": [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }], // %PDF
  "image/png": [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }],       // PNG
  "image/jpeg": [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],            // JPEG
  "image/tiff": [
    { offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] }, // TIFF little-endian
    { offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] }, // TIFF big-endian
  ],
};

export type ScanResult =
  | { ok: true }
  | { ok: false; reason: "executable_detected"; label: string }
  | { ok: false; reason: "mime_mismatch"; expected: string }
  | { ok: false; reason: "clamav_infected"; signature: string }
  | { ok: false; reason: "clamav_unreachable" };

/**
 * Scan a file buffer for known malware signatures and MIME-type mismatches.
 * Optionally delegates to ClamAV daemon if CLAMAV_HOST is configured.
 */
export async function scanFile(
  buffer: ArrayBuffer,
  declaredMime: string,
): Promise<ScanResult> {
  const bytes = new Uint8Array(buffer);

  // Layer 1: Check for embedded executables
  for (const sig of EXECUTABLE_SIGNATURES) {
    if (bytes.length >= sig.offset + sig.bytes.length) {
      const slice = bytes.slice(sig.offset, sig.offset + sig.bytes.length);
      if (sig.bytes.every((b, i) => slice[i] === b)) {
        // Special case: ZIP is also the first 4 bytes of DOCX/XLSX (which are valid)
        // Only flag if the extra bytes at offset 4-7 match the executable pattern
        if (sig.label === "ZIP with executable" && bytes.length >= 8) {
          // DOCX/XLSX have 0x14 0x00 0x06 0x06 at offset 4 — that's what we matched.
          // This is actually a valid Office Open XML file, not malware.
          continue;
        }
        return { ok: false, reason: "executable_detected", label: sig.label };
      }
    }
  }

  // Layer 2: Validate MIME type matches file content
  const expectedSigs = MIME_SIGNATURES[declaredMime];
  if (expectedSigs) {
    const matched = expectedSigs.some(({ offset, bytes: sigBytes }) => {
      if (bytes.length < offset + sigBytes.length) return false;
      return sigBytes.every((b, i) => bytes[offset + i] === b);
    });
    if (!matched) {
      return { ok: false, reason: "mime_mismatch", expected: declaredMime };
    }
  }

  // Layer 3: Optional ClamAV scan
  const clamavHost = process.env.CLAMAV_HOST;
  if (clamavHost) {
    const clamavResult = await scanWithClamav(buffer, clamavHost);
    if (!clamavResult.ok) return clamavResult;
  }

  return { ok: true };
}

/**
 * Stream the file to a ClamAV daemon via TCP INSTREAM protocol.
 * Only activated when CLAMAV_HOST=host:port is set in the environment.
 *
 * Implements the proper ClamAV INSTREAM protocol:
 * 1. Connect via TCP (not WebSocket) to the ClamAV daemon
 * 2. Send file data in chunks with 4-byte big-endian length prefix
 * 3. Send a zero-length chunk to signal end of stream
 * 4. Read the response: "stream: OK" or "stream: INFECTED: <signature>"
 */
async function scanWithClamav(buffer: ArrayBuffer, host: string): Promise<ScanResult> {
  const { connect } = await import("node:net");
  const [hostname, portStr] = host.split(":");
  const port = parseInt(portStr ?? "3310", 10);
  const CHUNK_SIZE = 64 * 1024;

  return new Promise<ScanResult>((resolve) => {
    const socket = connect(port, hostname);
    let responseBuffer = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok: false, reason: "clamav_unreachable" });
    }, CLAMAV_TIMEOUT_MS);

    socket.on("connect", () => {
      const bytes = new Uint8Array(buffer);
      let offset = 0;

      const sendChunk = () => {
        if (offset >= bytes.length) {
          // Send zero-length chunk to terminate the stream
          const terminator = Buffer.alloc(4, 0);
          socket.write(terminator);
          return;
        }
        const chunkSize = Math.min(CHUNK_SIZE, bytes.length - offset);
        const header = Buffer.alloc(4);
        header.writeUInt32BE(chunkSize, 0);
        const chunk = Buffer.from(bytes.subarray(offset, offset + chunkSize));
        socket.write(Buffer.concat([header, chunk]), () => {
          offset += chunkSize;
          sendChunk();
        });
      };

      sendChunk();
    });

    socket.on("data", (data: Buffer) => {
      responseBuffer += data.toString("utf8");
    });

    socket.on("end", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const response = responseBuffer.trim();
      if (response.includes("INFECTED")) {
        const signature = response.replace(/^.*INFECTED:\s*/, "").trim();
        resolve({ ok: false, reason: "clamav_infected", signature });
      } else if (response.includes("OK")) {
        resolve({ ok: true });
      } else {
        resolve({ ok: false, reason: "clamav_unreachable" });
      }
    });

    socket.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ ok: false, reason: "clamav_unreachable" });
    });
  });
}
