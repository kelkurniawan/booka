"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Semua status" },
  { value: "PENDING", label: "Menunggu pembayaran" },
  { value: "PAID", label: "Dibayar" },
  { value: "CANCELLED", label: "Dibatalkan" },
];

/**
 * Filter status + kolom pencarian ledger. `status` dan `q` datang dari
 * page.tsx (nilai mentah dari URL, bukan hasil validasi Zod) supaya kotak
 * pencarian tetap menampilkan apa yang diketik merchant walau nilainya
 * ditolak validasi (mis. kepanjangan atau mengandung karakter terlarang).
 *
 * page.tsx me-render komponen ini dengan `key={q}` -- itu (bukan
 * `useEffect` yang men-setState prop ke state, yang dilarang aturan
 * react-hooks/set-state-in-effect) yang membuat `searchInput` ikut ter-reset
 * setiap kali `q` di URL berubah dari luar komponen ini (tombol
 * back/forward browser, atau tautan "reset filter" dari Empty state):
 * key berubah -> React me-remount komponen -> useState(q) di bawah jalan
 * ulang dengan nilai q yang baru.
 */
export function BookingsFilters({ status, q }: { status: string; q: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(q);

  function navigate(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    // Filter berubah -> selalu balik ke halaman 1, supaya tidak terdampar di
    // halaman yang jadi kosong akibat filter baru.
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleStatusChange(value: string) {
    navigate({ status: value === "all" ? "" : value });
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ q: searchInput });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <form onSubmit={handleSearchSubmit} className="flex flex-1 items-center gap-2">
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Cari nama pelanggan atau nomor WhatsApp..."
          maxLength={80}
          aria-label="Cari booking berdasarkan nama pelanggan atau nomor WhatsApp"
        />
        <Button type="submit" variant="outline" size="icon" aria-label="Cari">
          <Search />
        </Button>
      </form>
      <Select value={status || "all"} onValueChange={handleStatusChange}>
        <SelectTrigger className="w-full sm:w-52" aria-label="Filter status booking">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
