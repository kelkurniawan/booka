"use client";

import { useState, useTransition } from "react";
import { Clock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import type { DayOfWeek } from "@/types/database";

import {
  createStaff,
  deleteStaff,
  saveStaffHours,
  updateStaff,
  type StaffActionResult,
} from "./actions";

type Hours = { day_of_week: DayOfWeek; start_time: string; end_time: string };
type StaffRow = { id: string; name: string; is_active: boolean; hours: Hours[] };

const DAYS: { day: DayOfWeek; label: string }[] = [
  { day: 1, label: "Senin" },
  { day: 2, label: "Selasa" },
  { day: 3, label: "Rabu" },
  { day: 4, label: "Kamis" },
  { day: 5, label: "Jumat" },
  { day: 6, label: "Sabtu" },
  { day: 7, label: "Minggu" },
];

function report(result: StaffActionResult, success?: string) {
  if (result.ok) {
    if (success) toast.success(success);
  } else {
    toast.error(result.message);
  }
}

/** Ringkasan jam kerja untuk baris daftar, mis. "Sen 09:00–17:00, Sel …". */
function hoursSummary(hours: Hours[]): string {
  if (hours.length === 0) return "Ikut jam kerja usaha";
  return [...hours]
    .sort((a, b) => a.day_of_week - b.day_of_week)
    .map((h) => `${DAYS[h.day_of_week - 1].label.slice(0, 3)} ${h.start_time}–${h.end_time}`)
    .join(", ");
}

export function StaffManager({ staff }: { staff: StaffRow[] }) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [editingHours, setEditingHours] = useState<StaffRow | null>(null);

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createStaff(name);
      report(result, "Staf ditambahkan");
      if (result.ok) setName("");
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nama staf, mis. Dewi"
          maxLength={60}
          aria-label="Nama staf baru"
        />
        <Button type="submit" disabled={pending || name.trim().length === 0}>
          {pending ? <Spinner /> : <Plus />} Tambah
        </Button>
      </form>

      {staff.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Belum ada staf. Selama kosong, semua booking masuk ke satu kalender seperti biasa.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {staff.map((member) => (
            <StaffCard key={member.id} member={member} onEditHours={() => setEditingHours(member)} />
          ))}
        </div>
      )}

      {editingHours ? (
        <HoursDialog member={editingHours} onClose={() => setEditingHours(null)} />
      ) : null}
    </div>
  );
}

function StaffCard({ member, onEditHours }: { member: StaffRow; onEditHours: () => void }) {
  const [name, setName] = useState(member.name);
  const [pending, startTransition] = useTransition();
  const dirty = name.trim() !== member.name;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          {member.name}
          {member.is_active ? null : <Badge variant="outline">Nonaktif</Badge>}
        </CardTitle>
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          Menerima booking
          <Switch
            aria-label={`${member.name} menerima booking`}
            checked={member.is_active}
            disabled={pending}
            onCheckedChange={(checked) =>
              startTransition(async () => report(await updateStaff(member.id, { is_active: checked })))
            }
          />
        </label>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            aria-label={`Nama ${member.name}`}
          />
          <Button
            variant="outline"
            disabled={!dirty || pending}
            onClick={() =>
              startTransition(async () => report(await updateStaff(member.id, { name }), "Nama disimpan"))
            }
          >
            Simpan
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm">{hoursSummary(member.hours)}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onEditHours}>
              <Clock /> Atur jam
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => report(await deleteStaff(member.id), "Staf dihapus"))
              }
            >
              <Trash2 /> Hapus
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HoursDialog({ member, onClose }: { member: StaffRow; onClose: () => void }) {
  const initial = new Map(member.hours.map((h) => [h.day_of_week, h]));
  const [custom, setCustom] = useState(member.hours.length > 0);
  const [rows, setRows] = useState(
    DAYS.map(({ day }) => ({
      day,
      enabled: initial.has(day),
      start: initial.get(day)?.start_time ?? "09:00",
      end: initial.get(day)?.end_time ?? "17:00",
    })),
  );
  const [pending, startTransition] = useTransition();

  function patch(day: DayOfWeek, change: Partial<(typeof rows)[number]>) {
    setRows((current) => current.map((row) => (row.day === day ? { ...row, ...change } : row)));
  }

  function handleSave() {
    const payload = custom
      ? rows
          .filter((row) => row.enabled)
          .map((row) => ({ day_of_week: row.day, start_time: row.start, end_time: row.end }))
      : [];
    if (custom && payload.length === 0) {
      toast.error("Pilih minimal satu hari kerja, atau ikuti jam kerja usaha.");
      return;
    }
    startTransition(async () => {
      const result = await saveStaffHours(member.id, payload);
      report(result, "Jam kerja disimpan");
      if (result.ok) onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Jam kerja {member.name}</DialogTitle>
          <DialogDescription>
            Booking untuk {member.name} hanya bisa dibuat di jam ini.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-center justify-between gap-2 text-sm">
          Jam kerja sendiri, bukan ikut jam usaha
          <Switch
            aria-label="Jam kerja sendiri"
            checked={custom}
            onCheckedChange={setCustom}
          />
        </label>

        {custom ? (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li
                key={row.day}
                className="grid grid-cols-[6rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-sm"
              >
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(event) => patch(row.day, { enabled: event.target.checked })}
                  />
                  {DAYS[row.day - 1].label}
                </label>
                <Input
                  type="time"
                  value={row.start}
                  disabled={!row.enabled}
                  className="min-w-0"
                  onChange={(event) => patch(row.day, { start: event.target.value })}
                  aria-label={`Jam mulai ${DAYS[row.day - 1].label}`}
                />
                <span aria-hidden>–</span>
                <Input
                  type="time"
                  value={row.end}
                  disabled={!row.enabled}
                  className="min-w-0"
                  onChange={(event) => patch(row.day, { end: event.target.value })}
                  aria-label={`Jam selesai ${DAYS[row.day - 1].label}`}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {member.name} bekerja di semua jam buka usaha (halaman Jam kerja).
          </p>
        )}

        <DialogFooter>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? <Spinner /> : null} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
