import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListMultipartUploadsCommand,
  GetObjectLockConfigurationCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"; // installed via @aws-sdk/client-s3 peer
import type { StorageBackend, StorageConfig, PresignedUploadResult } from "../storage.ts";

/**
 * S3-compatible storage — works with AWS S3, Cloudflare R2, MinIO, etc.
 * Uses @aws-sdk/client-s3 for proper authentication and request signing.
 */
export class S3Storage implements StorageBackend {
  private client: S3Client;
  private bucket: string;

  constructor(config: StorageConfig) {
    this.bucket = config.bucket;
    const region = config.region || "us-east-1";

    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new Error("S3 storage requires accessKeyId and secretAccessKey in config");
    }

    this.client = new S3Client({
      region,
      ...(config.endpoint
        ? {
            endpoint: config.endpoint,
            forcePathStyle: true, // Required for R2, MinIO, and custom endpoints
          }
        : {}),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async upload(path: string, data: Buffer, mime?: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: path,
        Body: data,
        ContentType: mime || "application/octet-stream",
      })
    );
  }

  async download(path: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: path,
      })
    );
    if (!res.Body) throw new Error(`S3 download returned empty body: ${path}`);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async delete(path: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: path,
      })
    );
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: path,
        })
      );
      return true;
    } catch (e: any) {
      if (e.name === "NotFound" || e.$metadata?.httpStatusCode === 404) return false;
      throw e;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const res = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      })
    );
    return (res.Contents || []).map((obj) => obj.Key!).filter(Boolean);
  }

  async getUrl(path: string): Promise<string> {
    // For custom endpoints (R2, MinIO), use the endpoint URL
    const endpoint = (this.client.config as any).endpoint;
    if (endpoint) {
      const base = typeof endpoint === "function" ? (await endpoint()).url.toString() : endpoint;
      return `${base}/${this.bucket}/${path}`;
    }
    const region = await this.client.config.region();
    return `https://${this.bucket}.s3.${region}.amazonaws.com/${path}`;
  }

  async getContentHash(path: string): Promise<string | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: path,
        })
      );
      // ETag is typically the MD5 hash (quoted), but for multipart uploads it's different
      return res.ETag?.replace(/"/g, "") || null;
    } catch {
      return null;
    }
  }

  async createPresignedUpload(
    path: string,
    opts: { contentType: string; expiresIn?: number }
  ): Promise<PresignedUploadResult | null> {
    const expiresIn = opts.expiresIn ?? 600; // 10 min default
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: path,
      ContentType: opts.contentType,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn });
    return {
      url,
      method: "PUT",
      headers: {
        "Content-Type": opts.contentType,
      },
      storagePath: path,
      expiresAt: Date.now() + expiresIn * 1000,
    };
  }

  async uploadStream(path: string, stream: NodeJS.ReadableStream, mime?: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: path,
        Body: stream as any,
        ContentType: mime || "application/octet-stream",
      })
    );
  }

  async downloadStream(path: string): Promise<NodeJS.ReadableStream> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: path })
    );
    if (!response.Body) throw new Error(`Empty response from S3 for ${path}`);
    return response.Body as NodeJS.ReadableStream;
  }

  async createMultipartUpload(
    path: string,
    contentType: string
  ): Promise<{
    uploadId: string;
    storagePath: string;
  }> {
    const response = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: path,
        ContentType: contentType,
      })
    );
    if (!response.UploadId) throw new Error("Failed to create multipart upload");
    return { uploadId: response.UploadId, storagePath: path };
  }

  async presignPart(
    path: string,
    uploadId: string,
    partNumber: number,
    expiresIn = 3600
  ): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: path,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  async completeMultipartUpload(
    path: string,
    uploadId: string,
    parts: Array<{ partNumber: number; etag: string }>
  ): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: path,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({
            PartNumber: p.partNumber,
            ETag: p.etag,
          })),
        },
      })
    );
  }

  async abortMultipartUpload(path: string, uploadId: string): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: path,
        UploadId: uploadId,
      })
    );
  }

  async listMultipartUploads(): Promise<
    Array<{
      uploadId: string;
      key: string;
      initiated: Date;
    }>
  > {
    const results: Array<{ uploadId: string; key: string; initiated: Date }> = [];
    let keyMarker: string | undefined;
    let uploadIdMarker: string | undefined;

    do {
      const response = await this.client.send(
        new ListMultipartUploadsCommand({
          Bucket: this.bucket,
          ...(keyMarker ? { KeyMarker: keyMarker } : {}),
          ...(uploadIdMarker ? { UploadIdMarker: uploadIdMarker } : {}),
        })
      );

      if (response.Uploads) {
        for (const upload of response.Uploads) {
          if (upload.UploadId && upload.Key) {
            results.push({
              uploadId: upload.UploadId,
              key: upload.Key,
              initiated: upload.Initiated ?? new Date(0),
            });
          }
        }
      }

      keyMarker = response.NextKeyMarker;
      uploadIdMarker = response.NextUploadIdMarker;
    } while (keyMarker);

    return results;
  }

  async setImmutable(path: string): Promise<void> {
    // S3 Object Lock is a bucket-level feature that must be enabled at creation.
    // We can't enable it per-object — but we verify it's active and warn if not.
    try {
      const response = await this.client.send(
        new GetObjectLockConfigurationCommand({ Bucket: this.bucket })
      );
      const lockEnabled = response.ObjectLockConfiguration?.ObjectLockEnabled === "Enabled";
      if (!lockEnabled) {
        console.warn(
          `[s3-storage] Object Lock NOT enabled on bucket ${this.bucket} — WORM protection for ${path} relies on bucket-level Object Lock (Compliance mode). Enable it at bucket creation or use a bucket policy with deny-overwrite.`
        );
      }
    } catch {
      // Some S3-compatible backends (R2, MinIO) may not support this API
      // — silently skip, the caller handles the no-op case
    }
  }
}
