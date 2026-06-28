/**
 * StorageBackend — pluggable interface for binary file storage.
 *
 * GBrain is agnostic about where files live. The setup skill picks
 * the backend (Supabase Storage or S3/R2/MinIO), gbrain doesn't care.
 */

export interface PresignedUploadResult {
  /** The presigned URL the client PUTs to. */
  url: string;
  /** HTTP method the client should use (PUT for S3, POST for some providers). */
  method: "PUT" | "POST";
  /** Headers the client must send (Content-Type, etc.). */
  headers: Record<string, string>;
  /** Storage path the object will land at — needed for confirm step. */
  storagePath: string;
  /** Unix ms timestamp when the presigned URL expires. */
  expiresAt: number;
}

export interface StorageBackend {
  upload(path: string, data: Buffer, mime?: string): Promise<void>;
  download(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(prefix: string): Promise<string[]>;
  getUrl(path: string): Promise<string>;

  /**
   * Generate a presigned URL for direct-to-storage upload. The client PUTs
   * the raw file bytes directly to the storage provider (S3/R2/MinIO),
   * bypassing the application server entirely — eliminating RAM pressure
   * from large uploads.
   *
   * Returns null when the backend doesn't support presigned URLs (local
   * storage); callers fall back to the streaming multipart path.
   */
  createPresignedUpload?(
    path: string,
    opts: { contentType: string; expiresIn?: number }
  ): Promise<PresignedUploadResult | null>;
}

export interface StorageConfig {
  backend: "s3" | "supabase" | "local";
  bucket: string;
  region?: string;
  endpoint?: string;
  // S3 credentials
  accessKeyId?: string;
  secretAccessKey?: string;
  // Supabase credentials
  projectUrl?: string;
  serviceRoleKey?: string;
  // Local (for testing)
  localPath?: string;
}

/**
 * Create a StorageBackend from config. When at-rest encryption is configured
 * (SUBSUMIO_STORAGE_ENCRYPTION_KEY set), the chosen backend is transparently
 * wrapped so files are encrypted on write and decrypted on read — regardless of
 * backend (local disk OR s3/r2). Without a key, behaviour is unchanged.
 */
export async function createStorage(config: StorageConfig): Promise<StorageBackend> {
  const backend = await createRawStorage(config);
  const { loadKeyring } = await import("./file-encryption.ts");
  const keyring = loadKeyring();
  if (keyring) {
    const { EncryptedStorage } = await import("./storage/encrypted.ts");
    return new EncryptedStorage(backend, keyring);
  }
  return backend;
}

async function createRawStorage(config: StorageConfig): Promise<StorageBackend> {
  switch (config.backend) {
    case "s3": {
      const { S3Storage } = await import("./storage/s3.ts");
      return new S3Storage(config);
    }
    case "supabase": {
      const { SupabaseStorage } = await import("./storage/supabase.ts");
      return new SupabaseStorage(config);
    }
    case "local": {
      const { LocalStorage } = await import("./storage/local.ts");
      return new LocalStorage(config.localPath || "/tmp/gbrain-storage");
    }
    default:
      throw new Error(`Unknown storage backend: ${config.backend}`);
  }
}
