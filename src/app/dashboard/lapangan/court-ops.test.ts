import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createCourt,
  deleteCourt,
  deleteCourtPhoto,
  mapCourtManageError,
  registerCourtPhoto,
  renameCourt,
  reorderCourts,
  saveCourtPhotoAlt,
  saveCourtProfile,
  saveVenueLayout,
  setCourtActive,
} from "./court-ops";

const UID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CID = "11111111-1111-4111-8111-111111111111";
const PID = "22222222-2222-4222-8222-222222222222";
type Err = { code: string; message?: string } | null;
type R = { data?: unknown; error?: Err; count?: number };
type Call = { op: string; table: string; payload?: unknown; filters: [string, unknown][] };

/** Klien palsu: hasil per "tabel.op" (op = select/insert/update/delete), Storage dan rpc dicatat. */
function fake(results: Record<string, R> = {}, opts: { removeError?: Err; removeThrows?: boolean; rpcError?: Err } = {}) {
  const calls: Call[] = [];
  const removed: string[][] = [];
  const rpcs: { name: string; args: unknown }[] = [];
  const client = {
    from(table: string) {
      const call: Call = { op: "select", table, filters: [] };
      calls.push(call);
      const done = () => {
        const r = results[`${table}.${call.op}`] ?? {};
        return { data: r.data ?? null, error: r.error ?? null, count: r.count ?? null };
      };
      const chain: Record<string, unknown> = {};
      for (const m of ["insert", "update", "delete"]) {
        chain[m] = (payload?: unknown) => {
          call.op = m;
          call.payload = payload;
          return chain;
        };
      }
      chain.eq = (k: string, v: unknown) => (call.filters.push([k, v]), chain);
      for (const m of ["select", "order", "in"]) chain[m] = () => chain;
      chain.single = () => Promise.resolve(done());
      chain.maybeSingle = () => Promise.resolve(done());
      chain.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(done()).then(ok, bad);
      return chain;
    },
    rpc(name: string, args: unknown) {
      rpcs.push({ name, args });
      return Promise.resolve({ data: null, error: opts.rpcError ?? null });
    },
    storage: {
      from: () => ({
        remove(paths: string[]) {
          removed.push(paths);
          if (opts.removeThrows) return Promise.reject(new Error("jaringan"));
          return Promise.resolve({ data: null, error: opts.removeError ?? null });
        },
      }),
    },
  };
  return { sb: client as never, calls, removed, rpcs };
}

const PATH = `${UID}/court/${CID}/abc.webp`;
const photo = { courtId: CID, path: PATH, width: 800, height: 600, altText: "Lapangan malam" };

// --- pemetaan galat ---------------------------------------------------------
const mapCases: [string, string | undefined, string | undefined, string, number | null][] = [
  ["23505", "23505", undefined, "name_taken", null],
  ["42501", "42501", undefined, "forbidden", null],
  ["22023", "22023", undefined, "invalid_data", null],
  ["23514", "23514", undefined, "invalid_data", null],
  ["23505 foto (jalur ganda)", "23505", "photo", "invalid_path", null],
  ["23503 hapus", "23503", "delete", "has_bookings", null],
  ["23503 foto", "23503", "photo", "court_not_found", null],
  ["P0001 batas foto", "P0001", undefined, "photo_limit", null],
  ["tak dikenal", "XX000", undefined, "server_error", null],
  ["tanpa kode", undefined, undefined, "server_error", null],
];
for (const [nama, kode, ctx, code] of mapCases) {
  test(`mapCourtManageError ${nama}`, () => {
    const m = mapCourtManageError(kode, ctx as never);
    assert.equal(m.code, code);
    assert.ok(m.error.length > 5 && !/postgres|constraint|violates/i.test(m.error));
  });
}

// --- tambah, ganti nama, urutan, aktif ---------------------------------------
test("createCourt sukses mengisi merchant_id dan urutan", async () => {
  const f = fake({ "courts.select": { count: 2 }, "courts.insert": { data: { id: CID, name: "L3" } } });
  const r = await createCourt(f.sb, UID, " L3 ");
  assert.deepEqual(r, { ok: true, court: { id: CID, name: "L3" } });
  const ins = f.calls.find((c) => c.op === "insert")!;
  assert.deepEqual(ins.payload, { merchant_id: UID, name: "L3", sort_order: 2 });
});
test("createCourt nama kosong: validation, tanpa query", async () => {
  const f = fake();
  const r = await createCourt(f.sb, UID, " ");
  assert.equal(r.ok === false && r.code, "validation");
  assert.equal(f.calls.length, 0);
});
test("createCourt nama ganda 23505 dipetakan", async () => {
  const f = fake({ "courts.select": { count: 0 }, "courts.insert": { error: { code: "23505", message: "duplicate key value" } } });
  const r = await createCourt(f.sb, UID, "L1");
  assert.deepEqual(r, { ok: false, code: "name_taken", error: "Nama lapangan itu sudah dipakai. Pakai nama lain." });
});

test("renameCourt sukses memfilter id dan merchant", async () => {
  const f = fake({ "courts.update": { data: [{ id: CID }] } });
  assert.deepEqual(await renameCourt(f.sb, UID, CID, "Baru"), { ok: true });
  assert.deepEqual(f.calls[0].filters, [["id", CID], ["merchant_id", UID]]);
});
test("renameCourt: 23505, baris tak ada (lapangan orang lain), id bukan uuid", async () => {
  const dup = fake({ "courts.update": { error: { code: "23505" } } });
  assert.equal((await renameCourt(dup.sb, UID, CID, "L1") as { code: string }).code, "name_taken");
  const none = fake({ "courts.update": { data: [] } });
  assert.equal((await renameCourt(none.sb, UID, CID, "L1") as { code: string }).code, "court_not_found");
  const bad = fake();
  assert.equal((await renameCourt(bad.sb, UID, "bukan-uuid", "L1") as { code: string }).code, "validation");
});

test("setCourtActive sukses dan tidak ditemukan", async () => {
  const ok = fake({ "courts.update": { data: [{ id: CID }] } });
  assert.deepEqual(await setCourtActive(ok.sb, UID, CID, false), { ok: true });
  assert.deepEqual(ok.calls[0].payload, { is_active: false });
  const none = fake({ "courts.update": { data: [] } });
  assert.equal((await setCourtActive(none.sb, UID, CID, true) as { code: string }).code, "court_not_found");
});

test("reorderCourts menulis sort_order sesuai urutan", async () => {
  const f = fake({ "courts.update": { data: [{ id: CID }] } });
  assert.deepEqual(await reorderCourts(f.sb, UID, [CID, PID]), { ok: true });
  assert.deepEqual(f.calls.map((c) => c.payload), [{ sort_order: 0 }, { sort_order: 1 }]);
});
test("reorderCourts: id ganda ditolak, galat DB dipetakan", async () => {
  assert.equal((await reorderCourts(fake().sb, UID, [CID, CID]) as { code: string }).code, "validation");
  const f = fake({ "courts.update": { error: { code: "42501" } } });
  assert.equal((await reorderCourts(f.sb, UID, [CID]) as { code: string }).code, "forbidden");
});

// --- hapus lapangan ----------------------------------------------------------
test("deleteCourt sukses menghapus semua objek foto lapangan itu", async () => {
  const p2 = `${UID}/court/${CID}/def.webp`;
  const f = fake({
    "bookings.select": { count: 0 },
    "court_media.select": { data: [{ path: PATH }, { path: p2 }] },
    "courts.delete": { data: [{ id: CID }] },
  });
  assert.deepEqual(await deleteCourt(f.sb, UID, CID), { ok: true, orphanedFiles: 0 });
  assert.deepEqual(f.removed, [[PATH, p2]]);
});
test("deleteCourt tanpa foto tidak memanggil Storage", async () => {
  const f = fake({ "bookings.select": { count: 0 }, "court_media.select": { data: [] }, "courts.delete": { data: [{ id: CID }] } });
  assert.deepEqual(await deleteCourt(f.sb, UID, CID), { ok: true, orphanedFiles: 0 });
  assert.equal(f.removed.length, 0);
});
test("deleteCourt dengan riwayat booking ditolak dengan pesan L6, tanpa hapus apa pun", async () => {
  const f = fake({ "bookings.select": { count: 3 }, "courts.update": { data: [{ id: CID }] } });
  const r = await deleteCourt(f.sb, UID, CID);
  assert.deepEqual(r, { ok: false, code: "has_bookings", deactivated: true, error: "Lapangan yang punya riwayat booking dinonaktifkan, bukan dihapus." });
  assert.ok(!f.calls.some((c) => c.op === "delete") && f.removed.length === 0);
  const upd = f.calls.find((c) => c.op === "update")!;
  assert.deepEqual(upd.payload, { is_active: false });
  assert.deepEqual(upd.filters, [["id", CID], ["merchant_id", UID]]);
});
test("deleteCourt: FK 23503 (balapan booking) dipetakan has_bookings dan Storage tidak disentuh", async () => {
  const f = fake({ "bookings.select": { count: 0 }, "court_media.select": { data: [{ path: PATH }] }, "courts.delete": { error: { code: "23503" } }, "courts.update": { data: [{ id: CID }] } });
  const r = await deleteCourt(f.sb, UID, CID);
  assert.equal(r.ok === false && r.code, "has_bookings");
  assert.equal(r.ok === false && r.deactivated, true);
  assert.equal(f.removed.length, 0);
});
test("deleteCourt: lapangan orang lain (0 baris) = court_not_found, Storage tidak disentuh", async () => {
  const f = fake({ "bookings.select": { count: 0 }, "court_media.select": { data: [] }, "courts.delete": { data: [] } });
  assert.equal((await deleteCourt(f.sb, UID, CID) as { code: string }).code, "court_not_found");
  assert.equal(f.removed.length, 0);
});
test("deleteCourt: Storage gagal setelah baris terhapus tetap sukses, orphanedFiles dilaporkan", async () => {
  const f = fake(
    { "bookings.select": { count: 0 }, "court_media.select": { data: [{ path: PATH }] }, "courts.delete": { data: [{ id: CID }] } },
    { removeError: { code: "500", message: "storage down" } },
  );
  assert.deepEqual(await deleteCourt(f.sb, UID, CID), { ok: true, orphanedFiles: 1 });
});
test("deleteCourt: Storage melempar galat jaringan tidak membatalkan hasil", async () => {
  const f = fake(
    { "bookings.select": { count: 0 }, "court_media.select": { data: [{ path: PATH }] }, "courts.delete": { data: [{ id: CID }] } },
    { removeThrows: true },
  );
  assert.deepEqual(await deleteCourt(f.sb, UID, CID), { ok: true, orphanedFiles: 1 });
});
test("deleteCourt: galat baca booking dipetakan server_error, tidak menghapus", async () => {
  const f = fake({ "bookings.select": { error: { code: "XX000" } } });
  assert.equal((await deleteCourt(f.sb, UID, CID) as { code: string }).code, "server_error");
  assert.ok(!f.calls.some((c) => c.op === "delete"));
});

// --- profil ------------------------------------------------------------------
const profile = { name: "L1", sport: "PADEL", environment: "INDOOR", surface: "", description: "", features: ["Lampu"] } as const;
test("saveCourtProfile sukses mengirim kolom ber-grant saja", async () => {
  const f = fake({ "courts.update": { data: [{ id: CID }] } });
  assert.deepEqual(await saveCourtProfile(f.sb, UID, CID, { ...profile }), { ok: true });
  assert.deepEqual(Object.keys(f.calls[0].payload as object).sort(), ["description", "environment", "features", "name", "sport", "surface"]);
});
test("saveCourtProfile: 6 ciri validation, 23505, 0 baris", async () => {
  const six = { ...profile, features: ["a", "b", "c", "d", "e", "f"] };
  assert.equal((await saveCourtProfile(fake().sb, UID, CID, six) as { code: string }).code, "validation");
  const dup = fake({ "courts.update": { error: { code: "23505" } } });
  assert.equal((await saveCourtProfile(dup.sb, UID, CID, { ...profile }) as { code: string }).code, "name_taken");
  const none = fake({ "courts.update": { data: [] } });
  assert.equal((await saveCourtProfile(none.sb, UID, CID, { ...profile }) as { code: string }).code, "court_not_found");
});

// --- foto --------------------------------------------------------------------
test("registerCourtPhoto sukses menyimpan baris dengan urutan berikutnya", async () => {
  const f = fake({ "court_media.select": { count: 1 }, "court_media.insert": { data: { id: PID } } });
  assert.deepEqual(await registerCourtPhoto(f.sb, UID, photo), { ok: true, id: PID });
  assert.deepEqual(f.calls.find((c) => c.op === "insert")!.payload, {
    court_id: CID, merchant_id: UID, path: PATH, alt_text: "Lapangan malam", width: 800, height: 600, sort_order: 1,
  });
  assert.equal(f.removed.length, 0);
});
test("registerCourtPhoto alt kosong tersimpan sebagai null", async () => {
  const f = fake({ "court_media.select": { count: 0 }, "court_media.insert": { data: { id: PID } } });
  await registerCourtPhoto(f.sb, UID, { ...photo, altText: "  " });
  assert.equal((f.calls.find((c) => c.op === "insert")!.payload as { alt_text: unknown }).alt_text, null);
});
test("registerCourtPhoto: path merchant lain / lapangan lain / traversal ditolak, objek dihapus", async () => {
  for (const path of [`${CID}/court/${CID}/a.webp`, `${UID}/court/${PID}/a.webp`, `${UID}/court/${CID}/../x.webp`, `${UID}/banner/a.webp`]) {
    const f = fake();
    const r = await registerCourtPhoto(f.sb, UID, { ...photo, path });
    assert.equal(r.ok === false && r.code, "invalid_path", path);
    assert.equal(f.calls.length, 0);
  }
});
test("registerCourtPhoto: batas 5 foto (P0001) dipetakan dan objek yatim dihapus", async () => {
  const f = fake({ "court_media.select": { count: 5 }, "court_media.insert": { error: { code: "P0001", message: "Satu lapangan maksimal 5 foto." } } });
  const r = await registerCourtPhoto(f.sb, UID, photo);
  assert.deepEqual(r, { ok: false, code: "photo_limit", error: "Satu lapangan maksimal 5 foto." });
  assert.deepEqual(f.removed, [[PATH]]);
});
test("registerCourtPhoto: lapangan merchant lain (23503) = court_not_found, objek dihapus", async () => {
  const f = fake({ "court_media.select": { count: 0 }, "court_media.insert": { error: { code: "23503" } } });
  assert.equal((await registerCourtPhoto(f.sb, UID, photo) as { code: string }).code, "court_not_found");
  assert.deepEqual(f.removed, [[PATH]]);
});
test("registerCourtPhoto: galat umum dan hapus objek yatim gagal tetap mengembalikan galat terpetakan", async () => {
  const f = fake({ "court_media.select": { count: 0 }, "court_media.insert": { error: { code: "XX000", message: "boom" } } }, { removeThrows: true });
  const r = await registerCourtPhoto(f.sb, UID, photo);
  assert.equal(r.ok === false && r.code, "server_error");
});
test("registerCourtPhoto: ukuran 0 ditolak validation", async () => {
  assert.equal((await registerCourtPhoto(fake().sb, UID, { ...photo, width: 0 }) as { code: string }).code, "validation");
});

test("saveCourtPhotoAlt sukses, kosong tersimpan null, 0 baris, alt 141", async () => {
  const ok = fake({ "court_media.update": { data: [{ id: PID }] } });
  assert.deepEqual(await saveCourtPhotoAlt(ok.sb, UID, PID, " Teks "), { ok: true });
  assert.deepEqual(ok.calls[0].payload, { alt_text: "Teks" });
  const empty = fake({ "court_media.update": { data: [{ id: PID }] } });
  await saveCourtPhotoAlt(empty.sb, UID, PID, "");
  assert.deepEqual(empty.calls[0].payload, { alt_text: null });
  const none = fake({ "court_media.update": { data: [] } });
  assert.equal((await saveCourtPhotoAlt(none.sb, UID, PID, "x") as { code: string }).code, "photo_not_found");
  assert.equal((await saveCourtPhotoAlt(fake().sb, UID, PID, "a".repeat(141)) as { code: string }).code, "validation");
});

test("deleteCourtPhoto sukses menghapus baris lalu objek Storage", async () => {
  const f = fake({ "court_media.select": { data: { path: PATH } }, "court_media.delete": { data: [{ id: PID }] } });
  assert.deepEqual(await deleteCourtPhoto(f.sb, UID, PID), { ok: true, orphanedFiles: 0 });
  assert.deepEqual(f.removed, [[PATH]]);
  assert.deepEqual(f.calls.find((c) => c.op === "delete")!.filters, [["id", PID], ["merchant_id", UID]]);
});
test("deleteCourtPhoto: foto tak ada / milik orang lain = photo_not_found, Storage tidak disentuh", async () => {
  const f = fake({ "court_media.select": { data: null } });
  assert.equal((await deleteCourtPhoto(f.sb, UID, PID) as { code: string }).code, "photo_not_found");
  assert.equal(f.removed.length, 0);
});
test("deleteCourtPhoto: galat hapus baris dipetakan dan objek dipertahankan", async () => {
  const f = fake({ "court_media.select": { data: { path: PATH } }, "court_media.delete": { error: { code: "42501" } } });
  assert.equal((await deleteCourtPhoto(f.sb, UID, PID) as { code: string }).code, "forbidden");
  assert.equal(f.removed.length, 0);
});
test("deleteCourtPhoto: Storage gagal setelah baris terhapus = sukses dengan orphanedFiles 1", async () => {
  const f = fake({ "court_media.select": { data: { path: PATH } }, "court_media.delete": { data: [{ id: PID }] } }, { removeError: { code: "500" } });
  assert.deepEqual(await deleteCourtPhoto(f.sb, UID, PID), { ok: true, orphanedFiles: 1 });
});

// --- denah -------------------------------------------------------------------
const layout = {
  courts: [{ id: CID, pos_x: 24, pos_y: 24, rotation: 90 as const }],
  areas: [{ id: PID, label: "Kantin", pos_x: 0, pos_y: 0, width: 100, height: 60, sort_order: 0 }],
  markers: [],
};
test("saveVenueLayout sukses memanggil save_venue_layout dengan tiga array", async () => {
  const f = fake();
  assert.deepEqual(await saveVenueLayout(f.sb, layout), { ok: true });
  assert.deepEqual(f.rpcs, [{ name: "save_venue_layout", args: { p_courts: layout.courts, p_areas: layout.areas, p_markers: [] } }]);
});
test("saveVenueLayout: Zod menolak tanpa memanggil RPC", async () => {
  const f = fake();
  const r = await saveVenueLayout(f.sb, { ...layout, courts: [{ ...layout.courts[0], pos_x: -1 }] });
  assert.equal(r.ok === false && r.code, "validation");
  assert.equal(f.rpcs.length, 0);
});
test("saveVenueLayout: 22023, 42501, tak dikenal dipetakan", async () => {
  for (const [code, want] of [["22023", "invalid_data"], ["42501", "forbidden"], ["XX000", "server_error"]] as const) {
    const f = fake({}, { rpcError: { code, message: "mentah" } });
    const r = await saveVenueLayout(f.sb, layout);
    assert.equal(r.ok === false && r.code, want);
    assert.ok(r.ok === false && !r.error.includes("mentah"));
  }
});

test("deleteCourt has_bookings: gagal menonaktifkan dilaporkan deactivated=false", async () => {
  const f = fake({ "bookings.select": { count: 1 }, "courts.update": { error: { code: "XX000" } } });
  const r = await deleteCourt(f.sb, UID, CID);
  assert.equal(r.ok === false && r.code, "has_bookings");
  assert.equal(r.ok === false && r.deactivated, false);
});

test("setCourtActive menolak nilai bukan boolean tanpa query", async () => {
  const f = fake();
  assert.equal((await setCourtActive(f.sb, UID, CID, "ya" as never) as { code: string }).code, "validation");
  assert.equal(f.calls.length, 0);
});

test("reorderCourts: sebagian gagal = reorder_partial, semua gagal = galat pertama", async () => {
  let n = 0;
  const partial = fake();
  const orig = partial.sb as unknown as { from: (t: string) => Record<string, unknown> };
  const from = orig.from.bind(orig);
  orig.from = (t: string) => {
    const chain = from(t);
    const i = n++;
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve(i === 0 ? { data: [{ id: CID }], error: null } : { data: null, error: { code: "XX000" } }).then(ok);
    return chain;
  };
  const r = await reorderCourts(partial.sb, UID, [CID, PID]);
  assert.equal(r.ok === false && r.code, "reorder_partial");
  const all = fake({ "courts.update": { error: { code: "42501" } } });
  assert.equal((await reorderCourts(all.sb, UID, [CID, PID]) as { code: string }).code, "forbidden");
});

test("registerCourtPhoto: ekstensi di luar webp/jpg/jpeg/png ditolak, JPG huruf besar diterima", async () => {
  for (const ext of ["gif", "svg", "exe", "html"]) {
    const f = fake();
    const r = await registerCourtPhoto(f.sb, UID, { ...photo, path: `${UID}/court/${CID}/a.${ext}` });
    assert.equal(r.ok === false && r.code, "invalid_path", ext);
    assert.equal(f.calls.length, 0);
  }
  const f = fake({ "court_media.select": { count: 0 }, "court_media.insert": { data: { id: PID } } });
  assert.equal((await registerCourtPhoto(f.sb, UID, { ...photo, path: `${UID}/court/${CID}/a.JPG` })).ok, true);
});

test("registerCourtPhoto: abort tidak menghapus objek yang sudah dirujuk baris lain", async () => {
  const f = fake({ "court_media.select": { count: 2, data: { id: PID } }, "court_media.insert": { error: { code: "23505" } } });
  const r = await registerCourtPhoto(f.sb, UID, photo);
  assert.equal(r.ok === false && r.code, "invalid_path");
  assert.equal(f.removed.length, 0);
});
