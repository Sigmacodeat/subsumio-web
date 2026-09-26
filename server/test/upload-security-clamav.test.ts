/**
 * ClamAV wiring of the upload gate (upload-security.ts).
 *
 * clamd runs as its own compose service without a shared upload volume, so a
 * path-based `SCAN <path>` can never succeed there. The default therefore
 * streams the file with INSTREAM; the path variant is opt-in via
 * CLAMAV_SHARED_PATH_SCAN=1. Files beyond clamd's StreamMaxLength are refused
 * with `file_too_large_for_scan` instead of being waved through.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clamAvStreamMaxBytes,
  inspectUploadBytes,
  inspectUploadFile,
} from "../src/core/upload-security.ts";

type Request = { command: "INSTREAM" | "SCAN"; payload: Buffer; raw: string };

/** Minimal clamd: understands zINSTREAM and SCAN, replies with a fixed line. */
function startFakeClamd(reply: string): Promise<{
  port: number;
  requests: Request[];
  close: () => Promise<void>;
}> {
  const requests: Request[] = [];
  const server: Server = createServer((socket) => {
    let buf = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      const header = "zINSTREAM\0";
      if (buf.subarray(0, header.length).toString("latin1") === header) {
        // Parse length-prefixed chunks until the zero-length terminator.
        let offset = header.length;
        const parts: Buffer[] = [];
        while (offset + 4 <= buf.length) {
          const len = buf.readUInt32BE(offset);
          if (len === 0) {
            requests.push({ command: "INSTREAM", payload: Buffer.concat(parts), raw: "" });
            socket.end(`${reply}\0`);
            return;
          }
          if (offset + 4 + len > buf.length) return; // wait for more
          parts.push(buf.subarray(offset + 4, offset + 4 + len));
          offset += 4 + len;
        }
        return;
      }
      const text = buf.toString("utf8");
      if (text.startsWith("SCAN ") && text.includes("\0")) {
        requests.push({ command: "SCAN", payload: Buffer.alloc(0), raw: text.split("\0")[0] });
        socket.end(`${reply}\0`);
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        port,
        requests,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

const savedEnv = {
  CLAMAV_HOST: process.env.CLAMAV_HOST,
  CLAMAV_SHARED_PATH_SCAN: process.env.CLAMAV_SHARED_PATH_SCAN,
  CLAMAV_STREAM_MAX_BYTES: process.env.CLAMAV_STREAM_MAX_BYTES,
};
let dir = "";
let pdfPath = "";
// > 64 KiB so the INSTREAM path has to send several chunks.
const PDF_BYTES = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(200 * 1024, 0x41)]);

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "subsumio-clamav-"));
  pdfPath = join(dir, "akte.pdf");
  writeFileSync(pdfPath, PDF_BYTES);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function pointAt(port: number): void {
  process.env.CLAMAV_HOST = `127.0.0.1:${port}`;
  delete process.env.CLAMAV_SHARED_PATH_SCAN;
  delete process.env.CLAMAV_STREAM_MAX_BYTES;
}

describe("inspectUploadFile: streams to clamd by default", () => {
  test("INSTREAM carries the complete file; no SCAN <path> is sent", async () => {
    const clamd = await startFakeClamd("stream: OK");
    try {
      pointAt(clamd.port);
      const result = await inspectUploadFile("akte.pdf", pdfPath);
      expect(result).toEqual({ ok: true });
      expect(clamd.requests).toHaveLength(1);
      expect(clamd.requests[0].command).toBe("INSTREAM");
      expect(clamd.requests[0].payload.equals(PDF_BYTES)).toBe(true);
    } finally {
      await clamd.close();
    }
  });

  test("a FOUND reply is a malware rejection", async () => {
    const clamd = await startFakeClamd("stream: Eicar-Test-Signature FOUND");
    try {
      pointAt(clamd.port);
      const result = await inspectUploadFile("akte.pdf", pdfPath);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("malware_detected");
    } finally {
      await clamd.close();
    }
  });

  test("clamd's own size-limit reply is reported as file_too_large_for_scan", async () => {
    const clamd = await startFakeClamd("INSTREAM size limit exceeded. ERROR");
    try {
      pointAt(clamd.port);
      const result = await inspectUploadFile("akte.pdf", pdfPath);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("file_too_large_for_scan");
    } finally {
      await clamd.close();
    }
  });

  test("a file above CLAMAV_STREAM_MAX_BYTES is refused before contacting clamd", async () => {
    const clamd = await startFakeClamd("stream: OK");
    try {
      pointAt(clamd.port);
      process.env.CLAMAV_STREAM_MAX_BYTES = String(PDF_BYTES.length - 1);
      const result = await inspectUploadFile("akte.pdf", pdfPath);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("file_too_large_for_scan");
      expect(clamd.requests).toHaveLength(0);
    } finally {
      await clamd.close();
    }
  });

  test("CLAMAV_SHARED_PATH_SCAN=1 switches to the path-based SCAN", async () => {
    const clamd = await startFakeClamd(`${pdfPath}: OK`);
    try {
      pointAt(clamd.port);
      process.env.CLAMAV_SHARED_PATH_SCAN = "1";
      const result = await inspectUploadFile("akte.pdf", pdfPath);
      expect(result).toEqual({ ok: true });
      expect(clamd.requests).toHaveLength(1);
      expect(clamd.requests[0].command).toBe("SCAN");
      expect(clamd.requests[0].raw).toBe(`SCAN ${pdfPath}`);
    } finally {
      await clamd.close();
    }
  });

  test("unreachable scanner fails closed", async () => {
    const clamd = await startFakeClamd("stream: OK");
    const port = clamd.port;
    await clamd.close();
    pointAt(port);
    const result = await inspectUploadFile("akte.pdf", pdfPath);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("scanner_unavailable");
  });
});

describe("inspectUploadBytes honours the stream limit", () => {
  test("default limit is clamd's 25 MB; env overrides it", () => {
    expect(clamAvStreamMaxBytes({})).toBe(25 * 1024 * 1024);
    expect(clamAvStreamMaxBytes({ CLAMAV_STREAM_MAX_BYTES: "524288000" })).toBe(524288000);
    expect(clamAvStreamMaxBytes({ CLAMAV_STREAM_MAX_BYTES: "nonsense" })).toBe(25 * 1024 * 1024);
  });

  test("oversized buffer is refused, not waved through", async () => {
    const clamd = await startFakeClamd("stream: OK");
    try {
      pointAt(clamd.port);
      process.env.CLAMAV_STREAM_MAX_BYTES = "16";
      const result = await inspectUploadBytes(
        "akte.pdf",
        Buffer.from("%PDF-1.7\n" + "x".repeat(32))
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("file_too_large_for_scan");
      expect(clamd.requests).toHaveLength(0);
    } finally {
      await clamd.close();
    }
  });

  test("buffer within the limit is streamed and accepted", async () => {
    const clamd = await startFakeClamd("stream: OK");
    try {
      pointAt(clamd.port);
      const data = Buffer.from("%PDF-1.7\nhello");
      expect(await inspectUploadBytes("akte.pdf", data)).toEqual({ ok: true });
      expect(clamd.requests[0].payload.equals(data)).toBe(true);
    } finally {
      await clamd.close();
    }
  });
});
