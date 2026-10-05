import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveIdentityDefaults } from "./identity-draft";

const SERVER = { fullName: "Studio Mawar", username: "" };

describe("resolveIdentityDefaults", () => {
  it("tanpa draft memakai nilai dari server", () => {
    assert.deepEqual(resolveIdentityDefaults(SERVER, null), {
      fullName: "Studio Mawar",
      username: "",
      usernameTouched: false,
      whatsappNumber: "",
    });
  });

  it("username bawaan dari ?u= dihitung sebagai pilihan sadar", () => {
    assert.equal(
      resolveIdentityDefaults({ fullName: "", username: "studio-mawar" }, null)
        .usernameTouched,
      true,
    );
  });

  it("draft menang atas nilai server", () => {
    assert.deepEqual(
      resolveIdentityDefaults(SERVER, {
        fullName: "Barbershop Jaya",
        username: "barbershop-jaya",
        usernameTouched: true,
        whatsappNumber: "0812-1111-2222",
      }),
      {
        fullName: "Barbershop Jaya",
        username: "barbershop-jaya",
        usernameTouched: true,
        whatsappNumber: "0812-1111-2222",
      },
    );
  });

  it("username yang belum disunting tetap ikut nama usaha setelah kembali", () => {
    // Merchant hanya mengetik nama usaha; username-nya turunan otomatis.
    // usernameTouched WAJIB tetap false, kalau tidak kolomnya membeku dan
    // berhenti mengikuti nama usaha begitu merchant kembali ke langkah ini.
    const hasil = resolveIdentityDefaults(SERVER, {
      fullName: "Barbershop Jaya",
      username: "barbershop-jaya",
      usernameTouched: false,
      whatsappNumber: "",
    });

    assert.equal(hasil.usernameTouched, false);
    assert.equal(hasil.username, "barbershop-jaya");
  });

  it("draft kosong tidak jatuh kembali ke nilai server", () => {
    // Merchant sengaja mengosongkan nama usaha. Mengembalikan "Studio Mawar"
    // di sini akan terasa seperti ketikannya dibatalkan diam-diam.
    assert.deepEqual(
      resolveIdentityDefaults(SERVER, {
        fullName: "",
        username: "",
        usernameTouched: true,
        whatsappNumber: "",
      }),
      { fullName: "", username: "", usernameTouched: true, whatsappNumber: "" },
    );
  });

  it("nomor WhatsApp yang sudah diketik tidak hilang saat kembali lalu maju lagi", () => {
    // Regresi: langkah identitas dulu hanya menahan fullName/username lewat
    // draft, sehingga nomor WhatsApp yang sudah diketik hilang begitu wizard
    // melepas OnboardingForm untuk menampilkan StepJam, lalu merchant kembali.
    const hasil = resolveIdentityDefaults(SERVER, {
      fullName: "Studio Mawar",
      username: "studio-mawar",
      usernameTouched: true,
      whatsappNumber: "0812-3456-7890",
    });

    assert.equal(hasil.whatsappNumber, "0812-3456-7890");
  });
});
