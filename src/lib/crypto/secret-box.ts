import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { serverEnv } from "@/lib/env/server";

/**
 * Enkripsi simetris untuk kredensial payment gateway merchant (access token,
 * refresh token, Server Key manual) sebelum disimpan di
 * `private.payment_credentials`.
 *
 * AES-256-GCM: authenticated encryption, jadi payload yang diutak-atik
 * (ciphertext atau authTag berubah) ditolak saat dekripsi, bukan cuma
 * menghasilkan plaintext sampah.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const CURRENT_VERSION = "v1";

/**
 * Prefiks versi wajib ada di setiap payload tersimpan. Kalau algoritma atau
 * skema enkripsi berubah nanti (mis. rotasi kunci), payload lama dan baru
 * tetap bisa dibedakan tanpa migrasi data serentak.
 */
const SUPPORTED_VERSIONS = new Set([CURRENT_VERSION]);

function getKey(): Buffer {
  const { tokenEncryptionKey } = serverEnv();

  if (!tokenEncryptionKey) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY belum diisi. Set variabel ini di .env.local " +
        "(openssl rand -base64 32) sebelum menyimpan atau membaca kredensial " +
        "payment gateway.",
    );
  }

  return Buffer.from(tokenEncryptionKey, "base64");
}

/** Enkripsi plaintext, mengembalikan payload berformat `v1.<iv>.<ciphertext>.<authTag>`. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH_BYTES);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    CURRENT_VERSION,
    iv.toString("base64"),
    ciphertext.toString("base64"),
    authTag.toString("base64"),
  ].join(".");
}

/** Dekripsi payload hasil {@link encryptSecret}. Menolak payload rusak atau versi asing. */
export function decryptSecret(payload: string): string {
  const key = getKey();

  const parts = payload.split(".");
  if (parts.length !== 4) {
    throw new Error(
      "Payload kredensial tidak valid: format harus " +
        "v1.<iv>.<ciphertext>.<authTag>.",
    );
  }

  const [version, ivB64, ciphertextB64, authTagB64] = parts;

  if (!SUPPORTED_VERSIONS.has(version)) {
    throw new Error(
      `Payload kredensial memakai versi enkripsi "${version}" yang tidak dikenal.`,
    );
  }

  let iv: Buffer;
  let ciphertext: Buffer;
  let authTag: Buffer;
  try {
    iv = Buffer.from(ivB64, "base64");
    ciphertext = Buffer.from(ciphertextB64, "base64");
    authTag = Buffer.from(authTagB64, "base64");
  } catch {
    throw new Error("Payload kredensial tidak valid: gagal decode base64.");
  }

  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error(
      `Payload kredensial tidak valid: panjang IV harus ${IV_LENGTH_BYTES} byte.`,
    );
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    // Salah key, authTag tidak cocok (payload diutak-atik), atau ciphertext
    // rusak — semuanya dilaporkan sebagai satu pesan generik supaya tidak
    // membocorkan detail kriptografi ke pemanggil.
    throw new Error(
      "Payload kredensial tidak valid atau rusak: dekripsi gagal.",
    );
  }
}
