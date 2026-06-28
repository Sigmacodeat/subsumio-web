/**
 * EncryptedStorage — a transparent at-rest encryption decorator around any
 * StorageBackend. `upload` encrypts with the keyring's active key; `download`
 * decrypts (and passes legacy plaintext through untouched). Everything else
 * (delete/exists/list/getUrl) delegates unchanged.
 *
 * Presigned uploads are deliberately disabled when encryption is on: a presigned
 * URL lets the client write bytes straight to the provider, bypassing this
 * decorator — which would store plaintext. Returning null forces the proxied
 * upload path (which routes through `upload` and therefore encrypts).
 */
import type { StorageBackend, PresignedUploadResult } from "../storage.ts";
import { type Keyring, encryptFile, decryptFile } from "../file-encryption.ts";

export class EncryptedStorage implements StorageBackend {
  constructor(
    private readonly inner: StorageBackend,
    private readonly keyring: Keyring
  ) {}

  async upload(path: string, data: Buffer, mime?: string): Promise<void> {
    return this.inner.upload(path, encryptFile(data, this.keyring), mime);
  }

  async download(path: string): Promise<Buffer> {
    const raw = await this.inner.download(path);
    return decryptFile(raw, this.keyring);
  }

  async delete(path: string): Promise<void> {
    return this.inner.delete(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.inner.exists(path);
  }

  async list(prefix: string): Promise<string[]> {
    return this.inner.list(prefix);
  }

  async getUrl(path: string): Promise<string> {
    return this.inner.getUrl(path);
  }

  // Encryption requires the bytes to pass through `upload`; direct-to-provider
  // presigned PUTs would store plaintext, so they are disabled here.
  async createPresignedUpload(): Promise<PresignedUploadResult | null> {
    return null;
  }
}
