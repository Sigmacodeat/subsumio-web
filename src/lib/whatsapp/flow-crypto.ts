/**
 * WhatsApp Flows — End-to-End Encryption
 *
 * Implements the Meta WhatsApp Flows encryption protocol:
 * 1. RSA-OAEP decryption of the AES key (using Flow private key)
 * 2. AES-GCM-256 decryption of the flow data
 * 3. AES-GCM-256 encryption of the response
 *
 * The private key is configured via WHATSAPP_FLOW_PRIVATE_KEY_PEM env var
 * (PEM format, RSA 2048+). The public key is registered with Meta via
 * the Flows API when creating a Flow.
 */

import {
  createDecipheriv,
  createCipheriv,
  privateDecrypt,
  createPrivateKey,
  type KeyObject,
} from "node:crypto";

const RSA_PADDING = {
  padding: 1, // RSA_PKCS1_OAEP_PADDING
  oaepHash: "sha256",
};

let cachedPrivateKey: KeyObject | null = null;

function getPrivateKey(): KeyObject | null {
  if (cachedPrivateKey) return cachedPrivateKey;
  const pem = process.env.WHATSAPP_FLOW_PRIVATE_KEY_PEM;
  if (!pem) return null;
  cachedPrivateKey = createPrivateKey({
    key: pem,
    format: "pem",
  });
  return cachedPrivateKey;
}

export interface DecryptedFlowRequest {
  version: string;
  action: "INIT" | "data_exchange" | "navigate";
  screen: string;
  data: Record<string, unknown>;
  flow_token: string;
}

export interface FlowEndpointResponse {
  version: string;
  screen: string;
  data: Record<string, unknown>;
  flow_token?: string;
  extension_message?: {
    flow_token: string;
    optional_params?: Record<string, unknown>;
  };
}

/** Decrypt an incoming WhatsApp Flow data exchange request. */
export function decryptFlowRequest(body: {
  encrypted_aes_key: string;
  encrypted_flow_data: string;
  initial_vector: string;
}): { request: DecryptedFlowRequest; aesKey: Buffer; iv: Buffer } | { error: string } {
  const privateKey = getPrivateKey();
  if (!privateKey) return { error: "flow_private_key_not_configured" };

  try {
    const encryptedAesKey = Buffer.from(body.encrypted_aes_key, "base64");
    const encryptedFlowData = Buffer.from(body.encrypted_flow_data, "base64");
    const iv = Buffer.from(body.initial_vector, "base64");

    // 1. Decrypt AES key using RSA-OAEP
    const aesKey = privateDecrypt(
      {
        key: privateKey,
        ...RSA_PADDING,
      },
      encryptedAesKey
    );

    // 2. Decrypt flow data using AES-GCM-256
    // The last 16 bytes of encryptedFlowData are the GCM auth tag
    const authTag = encryptedFlowData.subarray(encryptedFlowData.length - 16);
    const ciphertext = encryptedFlowData.subarray(0, encryptedFlowData.length - 16);

    const decipher = createDecipheriv("aes-256-gcm", aesKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    const request = JSON.parse(decrypted.toString("utf8")) as DecryptedFlowRequest;

    return { request, aesKey, iv };
  } catch (err) {
    return { error: `decryption_failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Encrypt a response to send back to the WhatsApp Flow client. */
export function encryptFlowResponse(
  response: FlowEndpointResponse,
  aesKey: Buffer,
  iv: Buffer
): string {
  // Flip the IV for the response (per Meta protocol)
  const flippedIv = Buffer.from(iv).reverse();

  const plaintext = JSON.stringify(response);

  const cipher = createCipheriv("aes-256-gcm", aesKey, flippedIv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Response format: encrypted_data + auth_tag, base64 encoded
  return Buffer.concat([encrypted, authTag]).toString("base64");
}
