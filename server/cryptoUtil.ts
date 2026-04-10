import crypto from "crypto";

// AES-256-GCM encryption for tenant exchange API keys.
// PRD §12.3 — keys encrypted at rest, never logged, never shared across tenants.

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.EXCHANGE_KEY_ENCRYPTION_KEY;
  if (!hex) throw new Error("EXCHANGE_KEY_ENCRYPTION_KEY not set");
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error(
      `EXCHANGE_KEY_ENCRYPTION_KEY must be 32 bytes hex (got ${buf.length})`
    );
  }
  return buf;
}

export interface EncryptedBlob {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export function encryptSecret(plaintext: string): EncryptedBlob {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ct.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(blob: EncryptedBlob): string {
  const decipher = crypto.createDecipheriv(
    ALGO,
    getKey(),
    Buffer.from(blob.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(blob.authTag, "base64"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, "base64")),
    decipher.final(),
  ]);
  return pt.toString("utf8");
}
