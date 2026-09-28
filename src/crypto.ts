import crypto from "node:crypto";
import { config } from "./config";

// Chaque token est chiffré individuellement (AES-256-GCM) avant d'être écrit
// en base. La clé ne provient jamais du code : elle vient de la variable
// d'environnement TOKEN_ENCRYPTION_KEY (64 caractères hex = 32 octets).
// Rien ici n'écrit de token en clair dans les logs.

function getKey(): Buffer {
  if (!config.tokenEncryptionKey) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY manquant. Générez-en un avec : " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  const key = Buffer.from(config.tokenEncryptionKey, "hex");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY doit faire 32 octets (64 caractères hex).");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // format stocké : iv.tag.ciphertext, tout en base64
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(stored: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = stored.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Format de token chiffré invalide.");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}
