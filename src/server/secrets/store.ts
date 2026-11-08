// Шифрование секретов каналов (ChannelConnection.config) — AES-256-GCM,
// образец V1 src/server/secrets/store.ts. Ключ — CHANNEL_SECRET_KEY (32 байта, base64).
// Формат: v1.<iv>.<authTag>.<ciphertext>; scope (id подключения) — AAD.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ChannelError } from "../channels/adapter";

function key(): Buffer {
  const value = process.env.CHANNEL_SECRET_KEY ?? "";
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== value) {
    throw new ChannelError("SECRET_UNAVAILABLE", 503);
  }
  return decoded;
}

export function sealSecret(secret: string, scope: string): string {
  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key(), iv);
    cipher.setAAD(Buffer.from(scope));
    const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(
      ".",
    );
  } catch {
    throw new ChannelError("SECRET_UNAVAILABLE", 503);
  }
}

export function openSecret(value: string, scope: string): string {
  try {
    const [version, nonce, tag, payload, extra] = value.split(".");
    if (version !== "v1" || !nonce || !tag || !payload || extra !== undefined) throw new Error();
    const iv = Buffer.from(nonce, "base64");
    const authTag = Buffer.from(tag, "base64");
    if (iv.length !== 12 || authTag.length !== 16) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAAD(Buffer.from(scope));
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(Buffer.from(payload, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new ChannelError("SECRET_UNAVAILABLE", 503);
  }
}

// Удобные обёртки: config подключения хранит одну запечатанную строку.
export function sealConfig(config: Record<string, unknown>, connectionId: string): string {
  return sealSecret(JSON.stringify(config), `connection:${connectionId}`);
}

export function openConfig(connection: { id: string; config: unknown }): Record<string, unknown> {
  if (typeof connection.config !== "string") return {};
  return JSON.parse(openSecret(connection.config, `connection:${connection.id}`)) as Record<string, unknown>;
}
