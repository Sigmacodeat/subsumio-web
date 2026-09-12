/**
 * Encrypted persistence for SaaS connector instances.
 *
 * Connector configuration, OAuth tokens and delta cursors are operational
 * secrets. They must not be stored in the container filesystem: that is
 * neither durable across deployments nor safely partitioned for tenants.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { BrainEngine } from "../../engine.ts";
import type { ConnectorConfig, ConnectorState } from "./base.ts";

const CIPHER_VERSION = "v1";

export interface ConnectorInstanceRecord {
  id: string;
  service: string;
  enabled: boolean;
  config: ConnectorConfig;
}

interface ConnectorInstanceRow {
  id: string;
  service: string;
  enabled: boolean;
  config_ciphertext: string;
}

interface ConnectorStateRow {
  state_ciphertext: string | null;
}

function encryptionKey(): Buffer {
  const secret = process.env.SUBSUMIO_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("SUBSUMIO_ENCRYPTION_KEY must be set to use SaaS connectors");
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

function encrypt(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    CIPHER_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

function decrypt<T>(ciphertext: string): T {
  const [version, ivText, tagText, payloadText, ...rest] = ciphertext.split(":");
  if (version !== CIPHER_VERSION || !ivText || !tagText || !payloadText || rest.length > 0) {
    throw new Error("Invalid encrypted connector payload");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivText, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payloadText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as T;
}

/** State-only surface consumed by BaseConnector. */
export interface ConnectorStateStore {
  load(connectorId: string): Promise<ConnectorState | undefined>;
  save(connectorId: string, state: ConnectorState): Promise<void>;
}

export class ConnectorSecretStore implements ConnectorStateStore {
  constructor(private readonly engine: BrainEngine) {}

  async list(tenantSourceId?: string): Promise<ConnectorInstanceRecord[]> {
    const rows = await this.engine.executeRaw<ConnectorInstanceRow>(
      tenantSourceId
        ? "SELECT id, service, enabled, config_ciphertext FROM connector_instances WHERE tenant_source_id = $1 ORDER BY created_at ASC"
        : "SELECT id, service, enabled, config_ciphertext FROM connector_instances ORDER BY created_at ASC",
      tenantSourceId ? [tenantSourceId] : []
    );
    return rows.map((row) => ({
      id: row.id,
      service: row.service,
      enabled: row.enabled,
      config: decrypt<ConnectorConfig>(row.config_ciphertext),
    }));
  }

  async upsert(record: ConnectorInstanceRecord, state: ConnectorState): Promise<void> {
    await this.engine.executeRaw(
      `INSERT INTO connector_instances
        (id, service, tenant_source_id, enabled, config_ciphertext, state_ciphertext, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO UPDATE SET
         service = EXCLUDED.service,
         tenant_source_id = EXCLUDED.tenant_source_id,
         enabled = EXCLUDED.enabled,
         config_ciphertext = EXCLUDED.config_ciphertext,
         state_ciphertext = EXCLUDED.state_ciphertext,
         updated_at = NOW()`,
      [
        record.id,
        record.service,
        record.config.tenant_source_id ?? null,
        record.enabled,
        encrypt(record.config),
        encrypt(state),
      ]
    );
  }

  async remove(connectorId: string): Promise<void> {
    await this.engine.executeRaw("DELETE FROM connector_instances WHERE id = $1", [connectorId]);
  }

  async setEnabled(connectorId: string, enabled: boolean): Promise<void> {
    await this.engine.executeRaw(
      "UPDATE connector_instances SET enabled = $2, updated_at = NOW() WHERE id = $1",
      [connectorId, enabled]
    );
  }

  async load(connectorId: string): Promise<ConnectorState | undefined> {
    const rows = await this.engine.executeRaw<ConnectorStateRow>(
      "SELECT state_ciphertext FROM connector_instances WHERE id = $1",
      [connectorId]
    );
    const ciphertext = rows[0]?.state_ciphertext;
    return ciphertext ? decrypt<ConnectorState>(ciphertext) : undefined;
  }

  async save(connectorId: string, state: ConnectorState): Promise<void> {
    await this.engine.executeRaw(
      "UPDATE connector_instances SET state_ciphertext = $2, updated_at = NOW() WHERE id = $1",
      [connectorId, encrypt(state)]
    );
  }
}
