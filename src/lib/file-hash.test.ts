// @vitest-environment node
// The default jsdom env ships a partial crypto.subtle; use node for real WebCrypto.
import { describe, it, expect } from "vitest";
import { computeFileSha256, computeFileSha256Streaming, DEFAULT_HASH_MAX_BYTES } from "./file-hash";

// Known SHA-256 vectors.
const SHA256_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const SHA256_EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("computeFileSha256", () => {
  it("hashes file content to the correct hex SHA-256", async () => {
    const blob = new Blob([new TextEncoder().encode("abc")]);
    expect(await computeFileSha256(blob)).toBe(SHA256_ABC);
  });

  it("hashes empty content correctly", async () => {
    expect(await computeFileSha256(new Blob([]))).toBe(SHA256_EMPTY);
  });

  it("returns lowercase 64-char hex (matches the server's /^[a-f0-9]{64}$/ check)", async () => {
    const hash = await computeFileSha256(new Blob([new Uint8Array([1, 2, 3, 4])]));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns null for files above the memory-safe cap (server falls back to size check)", async () => {
    // Fake an oversized blob without allocating memory.
    const huge = { size: DEFAULT_HASH_MAX_BYTES + 1 } as Blob;
    expect(await computeFileSha256(huge)).toBeNull();
  });

  it("honors a custom maxBytes threshold", async () => {
    const blob = new Blob([new Uint8Array(1000)]);
    expect(await computeFileSha256(blob, 500)).toBeNull();
    expect(await computeFileSha256(blob, 2000)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("computeFileSha256Streaming", () => {
  it("hashes file content to the correct hex SHA-256 (known vector)", async () => {
    const blob = new Blob([new TextEncoder().encode("abc")]);
    expect(await computeFileSha256Streaming(blob)).toBe(SHA256_ABC);
  });

  it("hashes empty content correctly", async () => {
    expect(await computeFileSha256Streaming(new Blob([]))).toBe(SHA256_EMPTY);
  });

  it("produces the same hash as computeFileSha256 for the same content", async () => {
    const data = new Uint8Array(100_000);
    for (let i = 0; i < data.length; i++) data[i] = i % 256;
    const blob = new Blob([data]);
    const oneShot = await computeFileSha256(blob);
    const streaming = await computeFileSha256Streaming(blob);
    expect(streaming).toBe(oneShot);
  });

  it("works with a small chunk size (exercises multi-chunk path)", async () => {
    const data = new TextEncoder().encode("a".repeat(100));
    const blob = new Blob([data]);
    const hash = await computeFileSha256Streaming(blob, 32); // 4 chunks
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    // Verify against known SHA-256 of 100 'a' chars
    const expected = await computeFileSha256(blob);
    expect(hash).toBe(expected);
  });

  it("returns lowercase 64-char hex", async () => {
    const hash = await computeFileSha256Streaming(new Blob([new Uint8Array([1, 2, 3, 4])]));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
