"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDuration, formatRupiah } from "@/lib/format";
import { removeMedia } from "@/lib/media/upload";
import type { Service, ServiceMedia, SubscriptionTier } from "@/types/database";

import { deleteService, toggleServiceActive } from "./actions";
import { ServiceFormDialog } from "./service-form-dialog";

export function ServicesTable({
  services,
  merchantId,
  tier,
  mediaByService,
}: {
  services: Service[];
  merchantId: string;
  tier: SubscriptionTier;
  mediaByService: Record<string, ServiceMedia[]>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Layanan</TableHead>
            <TableHead>Harga</TableHead>
            <TableHead>Durasi</TableHead>
            <TableHead>Aktif</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {services.map((service) => (
            <ServiceRow
              key={service.id}
              service={service}
              merchantId={merchantId}
              tier={tier}
              media={mediaByService[service.id] ?? []}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ServiceRow({
  service,
  merchantId,
  tier,
  media,
}: {
  service: Service;
  merchantId: string;
  tier: SubscriptionTier;
  media: ServiceMedia[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [togglePending, startToggle] = useTransition();
  const [deletePending, startDelete] = useTransition();

  function handleToggle(checked: boolean) {
    startToggle(async () => {
      const result = await toggleServiceActive(service.id, checked);
      if (!result.ok) {
        toast.error(result.message ?? "Gagal mengubah status layanan.");
      }
    });
  }

  function handleDelete() {
    startDelete(async () => {
      const result = await deleteService(service.id);
      if (result.ok) {
        // Baris service_media ikut terhapus lewat cascade, tapi berkasnya di
        // Storage tidak. Dibersihkan di sini supaya bucket tidak terisi berkas
        // yang tidak dirujuk apa pun.
        if (result.paths && result.paths.length > 0) {
          await removeMedia(result.paths);
        }
        toast.success("Layanan dihapus");
        setDeleteOpen(false);
      } else {
        toast.error(result.message ?? "Gagal menghapus layanan.");
      }
    });
  }

  return (
    <>
      <TableRow>
        <TableCell className="max-w-64 whitespace-normal">
          <div className="font-medium">{service.name}</div>
          {service.description ? (
            <p className="text-muted-foreground line-clamp-2 text-xs">
              {service.description}
            </p>
          ) : null}
        </TableCell>
        <TableCell className="whitespace-nowrap">{formatRupiah(service.price)}</TableCell>
        <TableCell className="whitespace-nowrap">
          {formatDuration(service.duration_minutes)}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Switch
              checked={service.is_active}
              disabled={togglePending}
              onCheckedChange={handleToggle}
              aria-label={service.is_active ? "Nonaktifkan layanan" : "Aktifkan layanan"}
            />
            {!service.is_active ? <Badge variant="secondary">Nonaktif</Badge> : null}
          </div>
        </TableCell>
        <TableCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <MoreHorizontal />
                <span className="sr-only">Menu layanan</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* preventDefault: dropdown radix mengembalikan fokus ke trigger
                  saat menutup, yang bisa bentrok dengan dialog yang baru
                  dibuka. Menahan default itu membuat dialog terbuka mulus. */}
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setEditOpen(true);
                }}
              >
                Ubah
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={(event) => {
                  event.preventDefault();
                  setDeleteOpen(true);
                }}
              >
                Hapus
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      <ServiceFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        service={service}
        merchantId={merchantId}
        tier={tier}
        media={media}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus &quot;{service.name}&quot;?</DialogTitle>
            <DialogDescription>
              Layanan ini akan hilang dari halaman booking Anda. Booking yang sudah ada
              tidak terpengaruh.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deletePending}
            >
              Batal
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deletePending}>
              {deletePending ? <Spinner /> : null}
              Hapus layanan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
