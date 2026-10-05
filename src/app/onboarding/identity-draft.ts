/**
 * Nilai identitas yang sedang diketik merchant di langkah 4.
 *
 * SENGAJA di luar `WizardAnswers`: tipe itu dibagi dengan `wizard-state.ts`
 * beserta testnya dan hanya memuat jawaban langkah 1-3. Identitas punya
 * validasinya sendiri (cek username ke server) yang tidak boleh ikut tercadang
 * ke sessionStorage.
 *
 * Modul MURNI, tanpa React -- supaya aturan "default mana yang berlaku saat
 * form dipasang ulang" bisa diuji `npm run test:unit`.
 */

export type IdentityDraft = {
  fullName: string;
  username: string;
  /**
   * True kalau merchant pernah menyunting kolom username sendiri. Setelah itu
   * username TIDAK BOLEH diturunkan ulang dari nama usaha -- ia sudah jadi
   * pilihan sadar.
   */
  usernameTouched: boolean;
  /** Sama seperti fullName/username: hilang diam-diam tanpa draft ini saat "Kembali". */
  whatsappNumber: string;
};

/**
 * Menentukan nilai awal langkah identitas.
 *
 * `OnboardingForm` dilepas sepenuhnya saat merchant menekan "Kembali", jadi
 * state internalnya hilang dan initializer-nya jalan lagi saat kembali. Tanpa
 * draft, yang muncul adalah nama dan username bawaan dari server -- ketikan
 * merchant terbuang diam-diam, di langkah yang paling banyak diketik dan
 * persis sebelum kirim.
 */
export function resolveIdentityDefaults(
  server: { fullName: string; username: string },
  draft: IdentityDraft | null,
): IdentityDraft {
  if (draft) return draft;

  return {
    fullName: server.fullName,
    username: server.username,
    // Username yang sudah diketik merchant di halaman depan (`?u=`) dianggap
    // pilihan sadar, sama seperti menyuntingnya di sini.
    usernameTouched: Boolean(server.username),
    // Server tidak pernah punya nomor WhatsApp bawaan -- kolom ini hanya
    // pernah terisi lewat draft merchant sendiri.
    whatsappNumber: "",
  };
}
