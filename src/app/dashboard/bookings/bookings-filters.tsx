"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Kotak pencarian daftar booking (nama atau WhatsApp). `q` datang dari
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
export function BookingsFilters({ q }: { q: string }) {
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
    // Pencarian berubah -> selalu balik ke halaman 1, supaya tidak terdampar di
    // halaman yang jadi kosong akibat filter baru.
    params.delete("page");
    params.delete("b");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ q: searchInput });
  }

  return (
    <div className="flex">
      <form onSubmit={handleSearchSubmit} className="flex flex-1 items-center gap-2">
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Cari nama atau WhatsApp"
          maxLength={80}
          aria-label="Cari booking"
          className="h-11"
        />
        <Button type="submit" variant="outline" size="icon" aria-label="Cari" className="size-11">
          <Search />
        </Button>
      </form>
    </div>
  );
}
