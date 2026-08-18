import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { serverEnv } from "@/lib/env/server";
import type { PaymentProvider } from "@/types/database";

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
const TAG_LENGTH_BYTES = 16;
const CURRENT_VERSION = "v1";

/**
 * Prefiks versi wajib ada di setiap payload tersimpan. Kalau algoritma atau
 * skema enkripsi berubah nanti (mis. rotasi kunci), payload lama dan baru
 * tetap bisa dibedakan tanpa migrasi data serentak.
 */
const SUPPORTED_VERSIONS = new Set([CURRENT_VERSION]);

/**
 * Konteks baris tempat kredensial ini akan disimpan. Diikat sebagai
 * Additional Authenticated Data (AAD) — tidak ikut disimpan dalam payload,
 * tapi wajib cocok persis saat dekripsi.
 *
 * Tanpa ini, ciphertext yang sah untuk satu baris `payment_connections` bisa
 * dipindah (mis. oleh siapa pun yang punya akses tulis ke DB) ke baris lain
 * dan tetap didekripsi dengan sukses — authTag GCM hanya membuktikan
 * ciphertext tidak diutak-atik, bukan bahwa ia memang milik baris ini.
 * Mengikat merchant_id + provider + field lewat AAD menutup celah itu:
 * ciphertext merchant A yang disalin ke baris merchant B akan gagal
 * verifikasi authTag karena AAD-nya tidak cocok.
 */
export type SecretContext = {
  merchantId: string;
  provider: PaymentProvider;
  /**
   * "webhook_token" ditambahkan untuk menyimpan token verifikasi webhook
   * Xendit (lihat supabase/migrations/20260813120100_webhook_token_credential.sql)
   * terpisah dari Secret Key charge. Ciphertext lama untuk
   * access_token/refresh_token tidak terpengaruh -- AAD hanya perlu cocok
   * per field, bukan per versi enum.
   */
  field: "access_token" | "refresh_token" | "webhook_token";
};

function buildAad(context: SecretContext): Buffer {
  return Buffer.from(
    `${context.merchantId}:${context.provider}:${context.field}`,
    "utf8",
  );
}

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

/**
 * Enkripsi plaintext, mengembalikan payload berformat
 * `v1.<iv>.<ciphertext>.<authTag>`. `context` tidak ikut disimpan di payload
 * — ia diikat lewat AAD dan wajib diberikan persis sama lagi saat dekripsi.
 */
export function encryptSecret(
  plaintext: string,
  context: SecretContext,
): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH_BYTES);

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH_BYTES,
  });
  cipher.setAAD(buildAad(context));

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

/**
 * Dekripsi payload hasil {@link encryptSecret}. Menolak payload rusak, versi
 * asing, authTag berukuran salah, atau `context` yang tidak cocok dengan
 * yang dipakai saat enkripsi (lihat {@link SecretContext}).
 */
export function decryptSecret(
  payload: string,
  context: SecretContext,
): string {
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

  const iv = Buffer.from(ivB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");

  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error(
      `Payload kredensial tidak valid: panjang IV harus ${IV_LENGTH_BYTES} byte.`,
    );
  }

  // Node menerima authTag yang dipotong (4/8/12/13/14/15/16 byte) kecuali
  // authTagLength dipatok eksplisit di createDecipheriv DAN panjang authTag
  // yang diberikan diperiksa sendiri sebelum dipakai. authTag yang dipotong
  // menurunkan biaya forgery dari 2^128 ke sekecil 2^32 dan membocorkan
  // subkey GHASH secara bertahap — jadi keduanya wajib, bukan salah satu.
  if (authTag.length !== TAG_LENGTH_BYTES) {
    throw new Error(
      `Payload kredensial tidak valid: panjang authTag harus ${TAG_LENGTH_BYTES} byte.`,
    );
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: TAG_LENGTH_BYTES,
    });
    decipher.setAAD(buildAad(context));
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    // Salah key, authTag/AAD tidak cocok (payload diutak-atik atau dipindah
    // ke baris lain), atau ciphertext rusak — semuanya dilaporkan sebagai
    // satu pesan generik supaya tidak membocorkan detail kriptografi ke
    // pemanggil.
    throw new Error(
      "Payload kredensial tidak valid atau rusak: dekripsi gagal.",
    );
  }
}
