"use client";

import { useState, useTransition } from "react";
import { ImageUp, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { StaffPicker, type StaffOption } from "@/components/booking-page/staff-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { captureVideoPoster, compressImage } from "@/lib/media/compress";
import { MEDIA_LIMITS, validateClipFile, validateImageFile } from "@/lib/media/limits";
import {
  CLIP_UPLOAD_BUCKET,
  clipPosterPath,
  clipUploadExtension,
  staffMediaPrefix,
} from "@/lib/media/staff-paths";
import { mediaFileName, removeMedia, uploadMedia } from "@/lib/media/upload";
import { publicMediaUrl } from "@/lib/media/url";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";
import { STAFF_PROFILE_LIMITS, staffProfileSchema, type StaffProfileInput } from "@/lib/validations/staff";

import type { StaffActionResult } from "./actions";

export type StaffProfileRow = {
  id: string;
  name: string;
  role: string | null;
  bio: string | null;
  tags: string[];
  photo_path: string | null;
  motion_path: string | null;
  show_motion: boolean;
};

type FieldErrors = Partial<Record<"role" | "bio" | "tags", string>>;

type Props = {
  merchantId: string;
  member: StaffProfileRow;
  /** `themeToCssVars()` merchant; hanya kotak pratinjau yang memakainya. */
  themeStyle: React.CSSProperties;
  saveProfile: (id: string, input: StaffProfileInput) => Promise<StaffActionResult>;
  removeClip: (id: string) => Promise<StaffActionResult>;
  onClose: () => void;
  /** Hanya untuk story: keadaan awal bagian klip. */
  initialClip?: { busy?: boolean; error?: string | null };
};

/** Unggah mentah ke bucket privat, lalu route mengubahnya jadi MP4 dan menulis motion_path. */
async function sendClip(file: File, merchantId: string, staffId: string): Promise<string> {
  const ext = clipUploadExtension(file.type);
  if (!ext) throw new Error("Format klip harus GIF, MP4, WebM, atau MOV.");
  const uploadPath = `${merchantId}/${staffId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await createClient()
    .storage.from(CLIP_UPLOAD_BUCKET)
    .upload(uploadPath, file, { contentType: file.type, upsert: false });
  if (error) throw new Error("Klip gagal diunggah. Coba lagi.");

  const res = await fetch(ROUTES.staffClipApi, {
    method: "POST",
    body: JSON.stringify({ staffId, uploadPath }),
  });
  const body = (await res.json().catch(() => null)) as { motionPath?: string; error?: string } | null;
  if (!res.ok || !body?.motionPath) throw new Error(body?.error ?? "Klip gagal diproses. Coba lagi.");
  return body.motionPath;
}

export function StaffProfileDialog({
  merchantId,
  member,
  themeStyle,
  saveProfile,
  removeClip,
  onClose,
  initialClip,
}: Props) {
  const [role, setRole] = useState(member.role ?? "");
  const [bio, setBio] = useState(member.bio ?? "");
  const [tags, setTags] = useState(member.tags);
  const [tagInput, setTagInput] = useState("");
  const [showMotion, setShowMotion] = useState(member.show_motion);
  const [savedPhoto, setSavedPhoto] = useState(member.photo_path);
  const [photoPath, setPhotoPath] = useState(member.photo_path);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [motionPath, setMotionPath] = useState(member.motion_path);
  const [clipBusy, setClipBusy] = useState(initialClip?.busy ?? false);
  const [clipError, setClipError] = useState<string | null>(initialClip?.error ?? null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, startSaving] = useTransition();
  const busy = photoBusy || clipBusy || saving;

  const draftPhoto = photoPath && photoPath !== savedPhoto ? photoPath : null;

  function close() {
    // Foto draf yang tidak jadi disimpan dibuang supaya tidak yatim di bucket.
    if (draftPhoto) void removeMedia([draftPhoto]);
    onClose();
  }

  async function pickPhoto(file: File) {
    const galat = validateImageFile(file);
    if (galat) {
      toast.error(galat);
      return;
    }
    setPhotoBusy(true);
    try {
      const { blob } = await compressImage(file, { maxSide: MEDIA_LIMITS.avatarMaxSide, square: true });
      const baru = staffMediaPrefix(merchantId, member.id) + mediaFileName("photo", "webp");
      await uploadMedia(baru, blob, "image/webp");
      if (draftPhoto) await removeMedia([draftPhoto]);
      setPhotoPath(baru);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Foto gagal diunggah.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function pickClip(file: File) {
    setClipError(null);
    setClipBusy(true);
    try {
      let duration: number | null = null;
      if (file.type.startsWith("video/")) {
        // Video yang tidak bisa dibaca browser (mis. MOV) tetap dicoba; server memeriksa ulang.
        duration = await captureVideoPoster(file).then((r) => r.duration, () => null);
      }
      const galat = validateClipFile(file, duration);
      if (galat) throw new Error(galat);
      const baru = await sendClip(file, merchantId, member.id);
      setMotionPath(baru);
      toast.success("Klip tersimpan");
    } catch (error) {
      setClipError(error instanceof Error ? error.message : "Klip gagal diproses. Coba lagi.");
    } finally {
      setClipBusy(false);
    }
  }

  function deleteClip() {
    startSaving(async () => {
      const result = await removeClip(member.id);
      if (result.ok) setMotionPath(null);
      else toast.error(result.message);
    });
  }

  function addTag() {
    const tag = tagInput.trim();
    if (!tag) return;
    setTags((lama) => [...lama, tag]);
    setTagInput("");
    setErrors((lama) => ({ ...lama, tags: undefined }));
  }

  function save() {
    const input: StaffProfileInput = { role, bio, tags, photo_path: photoPath, show_motion: showMotion };
    const parsed = staffProfileSchema.safeParse(input);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if ((key === "role" || key === "bio" || key === "tags") && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    startSaving(async () => {
      const result = await saveProfile(member.id, input);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      // Foto lama baru dihapus setelah penggantinya tersimpan.
      if (savedPhoto && savedPhoto !== photoPath) await removeMedia([savedPhoto]);
      setSavedPhoto(photoPath);
      toast.success("Profil disimpan");
      onClose();
    });
  }

  const preview: StaffOption = {
    id: member.id,
    name: member.name,
    role: role.trim() || null,
    bio: bio.trim() || null,
    tags,
    photoUrl: photoPath ? publicMediaUrl(photoPath) : null,
    motionUrl: motionPath ? publicMediaUrl(motionPath) : null,
    posterUrl: motionPath ? publicMediaUrl(clipPosterPath(motionPath)) : null,
  };

  return (
    <Dialog open onOpenChange={(open) => (open || busy ? null : close())}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Profil {member.name}</DialogTitle>
          <DialogDescription>Foto dan perkenalan ini tampil saat pelanggan memilih staf.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-5">
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Foto profil</legend>
              <p className="text-muted-foreground text-sm">JPG, PNG, atau WebP. Dipotong persegi.</p>
              <div className="flex flex-wrap items-center gap-2">
                <FilePick
                  label={photoPath ? "Ganti foto" : "Pilih foto"}
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  busy={photoBusy}
                  onFile={pickPhoto}
                />
                {photoPath ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => {
                      if (draftPhoto) void removeMedia([draftPhoto]);
                      setPhotoPath(null);
                    }}
                  >
                    <Trash2 /> Hapus foto
                  </Button>
                ) : null}
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Foto bergerak (opsional)</legend>
              <p className="text-muted-foreground text-sm">
                GIF atau video tanpa suara, maks 5 detik, 8 MB. Diubah ke MP4 agar ringan.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <FilePick
                  label={motionPath ? "Ganti klip" : "Pilih klip"}
                  accept="image/gif,video/mp4,video/webm,video/quicktime"
                  disabled={busy}
                  busy={false}
                  onFile={pickClip}
                />
                {motionPath ? (
                  <Button type="button" variant="ghost" className="min-h-11" disabled={busy} onClick={deleteClip}>
                    <Trash2 /> Hapus klip
                  </Button>
                ) : null}
              </div>
              {clipBusy ? (
                <p role="status" className="flex items-center gap-2 text-sm">
                  <Spinner /> Mengubah klip ke MP4
                </p>
              ) : null}
              {clipError ? (
                <p role="alert" className="text-sm font-medium">
                  {clipError}
                </p>
              ) : null}
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="staf-peran" className="text-sm font-medium">
                Peran
              </label>
              <Input
                id="staf-peran"
                value={role}
                maxLength={STAFF_PROFILE_LIMITS.roleMax}
                placeholder="Contoh: Pemilik, MUA"
                aria-invalid={Boolean(errors.role)}
                aria-describedby={errors.role ? "staf-peran-galat" : undefined}
                onChange={(event) => setRole(event.target.value)}
              />
              {errors.role ? (
                <p id="staf-peran-galat" className="text-sm font-medium">
                  {errors.role}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="staf-bio" className="text-sm font-medium">
                Perkenalan singkat
              </label>
              <Textarea
                id="staf-bio"
                value={bio}
                rows={3}
                aria-invalid={Boolean(errors.bio)}
                aria-describedby="staf-bio-info"
                onChange={(event) => setBio(event.target.value)}
              />
              <p id="staf-bio-info" className="text-muted-foreground text-sm">
                {errors.bio ? <span className="text-foreground font-medium">{errors.bio} </span> : null}
                {bio.length}/{STAFF_PROFILE_LIMITS.bioMax}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="staf-tag" className="text-sm font-medium">
                Keahlian
              </label>
              {tags.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <li key={tag} className="bg-muted flex items-center gap-1 rounded-full py-0.5 pl-3 text-sm">
                      {tag}
                      <button
                        type="button"
                        aria-label={`Hapus keahlian ${tag}`}
                        className="focus-visible:ring-ring/50 flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-3"
                        onClick={() => setTags((lama) => lama.filter((t) => t !== tag))}
                      >
                        <X aria-hidden className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex gap-2">
                <Input
                  id="staf-tag"
                  value={tagInput}
                  maxLength={STAFF_PROFILE_LIMITS.tagMax}
                  placeholder="+ Tambah"
                  disabled={tags.length >= STAFF_PROFILE_LIMITS.tagsMax}
                  aria-describedby={errors.tags ? "staf-tag-galat" : undefined}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTag();
                    }
                  }}
                />
                <Button type="button" variant="outline" className="min-h-11" onClick={addTag} disabled={!tagInput.trim()}>
                  Tambah
                </Button>
              </div>
              <p id="staf-tag-galat" className="text-muted-foreground text-sm">
                {errors.tags ? <span className="text-foreground font-medium">{errors.tags} </span> : null}
                Maksimal {STAFF_PROFILE_LIMITS.tagsMax} keahlian.
              </p>
            </div>

            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={showMotion}
                onChange={(event) => setShowMotion(event.target.checked)}
              />
              Tampilkan foto bergerak di halaman booking
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Yang dilihat pelanggan</h3>
            <div style={themeStyle} className="bg-background text-foreground border p-3" aria-live="off">
              {/* todayISO kosong aman: nearest `{}` tidak pernah memakainya. */}
              <StaffPicker
                staff={[preview]}
                selectedId={member.id}
                onSelect={() => {}}
                nearest={{}}
                todayISO=""
                forceStatic={!showMotion}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={close}>
            Batal
          </Button>
          <Button type="button" className="min-h-11" disabled={busy} onClick={save}>
            {saving ? <Spinner /> : null} Simpan profil
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Tombol pemilih berkas yang bisa dengan keyboard: input asli disembunyikan secara visual saja. */
function FilePick({
  label,
  accept,
  disabled,
  busy,
  onFile,
}: {
  label: string;
  accept: string;
  disabled: boolean;
  busy: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <label
      className={`border-input has-[:focus-visible]:ring-ring/50 inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm font-medium has-[:focus-visible]:ring-3 ${
        disabled ? "opacity-50" : "cursor-pointer"
      }`}
    >
      {busy ? <Spinner /> : <ImageUp aria-hidden className="size-4" />}
      {label}
      <input
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </label>
  );
}
