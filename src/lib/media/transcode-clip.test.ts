import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import ffmpegPath from "ffmpeg-static";

import {
  ClipError,
  clipFfmpegArgs,
  parseFfmpegDuration,
  transcodeClip,
} from "./transcode-clip";

/** Membuat fixture lewat ffmpeg; mengembalikan byte berkas. */
function bikin(nama: string, args: string[]): Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), "fx-"));
  try {
    const out = join(dir, nama);
    const r = spawnSync(ffmpegPath!, ["-hide_banner", ...args, "-y", out]);
    assert.equal(r.status, 0, String(r.stderr));
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function probeStderr(bytes: Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), "fx-"));
  try {
    const f = join(dir, "x.mp4");
    writeFileSync(f, bytes);
    return String(spawnSync(ffmpegPath!, ["-hide_banner", "-i", f]).stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Durasi di dalam sumber lavfi: sumber tanpa batas membuat ffmpeg tak pernah selesai.
const testsrc = (n: number) => ["-f", "lavfi", "-i", `testsrc=size=320x240:rate=10:duration=${n}`];

describe("parseFfmpegDuration", () => {
  it("membaca durasi", () => {
    assert.equal(parseFfmpegDuration("  Duration: 00:00:04.20, start: 0.000000, bitrate: 1 kb/s"), 4.2);
    assert.equal(parseFfmpegDuration("Duration: 00:01:02.50,"), 62.5);
  });
  it("null bila tidak tercatat", () => {
    assert.equal(parseFfmpegDuration("Duration: N/A, start"), null);
    assert.equal(parseFfmpegDuration(""), null);
  });
});

describe("clipFfmpegArgs", () => {
  it("whitelist sebelum -i, tanpa audio, potong 5 detik", () => {
    const a = clipFfmpegArgs("in", "out");
    assert.ok(a.indexOf("-format_whitelist") < a.indexOf("-i"));
    assert.ok(a.indexOf("-protocol_whitelist") < a.indexOf("-i"));
    assert.ok(a.includes("-an"));
    assert.equal(a[a.indexOf("-t") + 1], "5");
    assert.equal(a.at(-1), "out");
  });
});

describe("transcodeClip", () => {
  it("GIF 2 detik jadi MP4 dengan poster JPG", async () => {
    const r = await transcodeClip(bikin("a.gif", testsrc(2)));
    assert.equal(Buffer.from(r.mp4.slice(4, 8)).toString(), "ftyp");
    assert.equal(r.poster[0], 0xff);
    assert.equal(r.poster[1], 0xd8);
    assert.ok(r.durationSeconds! > 1.9 && r.durationSeconds! < 2.1);
  });

  it("GIF 7 detik dilaporkan >5 dan keluaran dipotong", async () => {
    const r = await transcodeClip(bikin("a.gif", testsrc(7)));
    assert.ok(r.durationSeconds! > 5);
    assert.ok(parseFfmpegDuration(probeStderr(r.mp4))! <= 5.05);
  });

  it("audio dibuang", async () => {
    const mp4 = bikin("a.mp4", [...testsrc(2), "-f", "lavfi", "-i", "sine=duration=2"]);
    const r = await transcodeClip(mp4);
    assert.ok(!probeStderr(r.mp4).includes("Audio:"));
  });

  it("playlist yang menyamar ditolak", async () => {
    const jahat = Buffer.from("#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nfile:///etc/passwd\n#EXT-X-ENDLIST\n");
    await assert.rejects(transcodeClip(jahat), ClipError);
  });
});
