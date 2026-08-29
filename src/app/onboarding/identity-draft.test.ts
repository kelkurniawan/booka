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
      }),
      {
        fullName: "Barbershop Jaya",
        username: "barbershop-jaya",
        usernameTouched: true,
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
      }),
      { fullName: "", username: "", usernameTouched: true },
    );
  });
});
