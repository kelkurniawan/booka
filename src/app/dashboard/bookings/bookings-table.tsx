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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatRupiah, formatTime } from "@/lib/format";

import { cancelBooking } from "./actions";
import { BookingDetailDialog } from "./booking-detail-dialog";
import { type BookingListItem, getDisplayStatus, STATUS_META } from "./booking-state";

export function BookingsTable({ bookings }: { bookings: BookingListItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Jadwal</TableHead>
            <TableHead>Pelanggan</TableHead>
            <TableHead>Layanan</TableHead>
            <TableHead>Nilai</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((booking) => (
            <BookingRow key={booking.id} booking={booking} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function BookingRow({ booking }: { booking: BookingListItem }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelPending, startCancel] = useTransition();

  const displayStatus = getDisplayStatus(booking);
  const meta = STATUS_META[displayStatus];
  // Booking yang sudah CANCELLED (atau EXPIRED, karena statusnya di database
  // masih PENDING sampai cron jalan -- lihat cancelBooking di actions.ts
  // yang memfilter status in ('PENDING','PAID')) tetap boleh dicoba
  // dibatalkan lagi lewat menu ini; actions.ts yang menolaknya dengan pesan
  // jelas. Hanya baris yang statusnya SUDAH CANCELLED di database yang
  // disembunyikan aksinya di sini, supaya menunya tidak menyesatkan.
  const cancellable = booking.status !== "CANCELLED";

  function handleCancel() {
    startCancel(async () => {
      const result = await cancelBooking(booking.id);
      if (result.ok) {
        toast.success("Booking dibatalkan");
        setCancelOpen(false);
      } else {
        toast.error(result.message ?? "Gagal membatalkan booking.");
      }
    });
  }

  return (
    <>
      <TableRow>
        <TableCell className="whitespace-nowrap">
          <div>{formatDate(booking.start_datetime)}</div>
          <div className="text-muted-foreground text-xs">{formatTime(booking.start_datetime)}</div>
        </TableCell>
        <TableCell className="max-w-40 truncate">{booking.customer_name}</TableCell>
        <TableCell className="max-w-48 truncate">{booking.service_name}</TableCell>
        <TableCell className="whitespace-nowrap">{formatRupiah(booking.service_price)}</TableCell>
        <TableCell>
          <Badge variant={meta.badgeVariant}>{meta.label}</Badge>
        </TableCell>
        <TableCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <MoreHorizontal />
                <span className="sr-only">Menu booking</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setDetailOpen(true);
                }}
              >
                Lihat detail
              </DropdownMenuItem>
              {cancellable ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(event) => {
                    event.preventDefault();
                    setCancelOpen(true);
                  }}
                >
                  Batalkan
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      <BookingDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        booking={booking}
        onCancelRequest={
          cancellable
            ? () => {
                setDetailOpen(false);
                setCancelOpen(true);
              }
            : undefined
        }
      />

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batalkan booking &quot;{booking.customer_name}&quot;?</DialogTitle>
            <DialogDescription>
              Slot jadwal ini akan dilepas dan bisa dipesan pelanggan lain. Tindakan ini
              tidak bisa dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelOpen(false)}
              disabled={cancelPending}
            >
              Batal
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelPending}>
              {cancelPending ? <Spinner /> : null}
              Batalkan booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
