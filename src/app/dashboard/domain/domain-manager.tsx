"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { DomainStatus } from "@/types/database";

import { checkDomain, registerDomain, removeDomain, type DomainActionResult } from "./actions";

type DnsRecord = { type: string; name: string; value: string };

function report(result: DomainActionResult) {
  if (result.ok) {
    if (result.message) toast.success(result.message);
  } else {
    toast.error(result.message);
  }
}

export function DomainManager({
  domain,
  status,
  records,
  username,
}: {
  domain: string | null;
  status: DomainStatus | null;
  records: DnsRecord[];
  username: string;
}) {
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();

  if (!domain) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Pasang domain</CardTitle>
          <CardDescription>
            Anda butuh domain yang sudah dibeli (mis. di Niagahoster, Rumahweb, atau Cloudflare)
            dan akses ke pengaturan DNS-nya. Subdomain seperti booking.salonanda.id paling mudah.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(async () => report(await registerDomain(input)));
            }}
          >
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="booking.salonanda.id"
              aria-label="Nama domain"
              autoCapitalize="none"
              spellCheck={false}
            />
            <Button type="submit" disabled={pending || input.trim().length === 0}>
              {pending ? <Spinner /> : null} Pasang
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {domain}
          {status === "ACTIVE" ? <Badge>Aktif</Badge> : <Badge variant="outline">Menunggu DNS</Badge>}
        </CardTitle>
        <CardDescription>
          {status === "ACTIVE"
            ? `Halaman /${username} kini juga terbuka di https://${domain}.`
            : "Pasang kedua record berikut di pengaturan DNS domain Anda, lalu tekan Periksa."}
        </CardDescription>
      </CardHeader>
      {status === "ACTIVE" ? null : (
        <CardContent>
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground text-xs">
              <tr>
                <th className="pb-2 font-normal">Tipe</th>
                <th className="pb-2 font-normal">Nama</th>
                <th className="pb-2 font-normal">Nilai</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {records.map((record) => (
                <tr key={record.type} className="border-t align-top">
                  <td className="py-2 pr-3">{record.type}</td>
                  <td className="py-2 pr-3 break-all">{record.name}</td>
                  <td className="py-2 break-all select-all">{record.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-muted-foreground mt-3 text-xs">
            Record TXT membuktikan domain ini milik Anda. Perubahan DNS bisa butuh beberapa menit
            sampai beberapa jam.
          </p>
        </CardContent>
      )}
      <CardFooter className="flex gap-2">
        {status === "ACTIVE" ? null : (
          <Button
            disabled={pending}
            onClick={() => startTransition(async () => report(await checkDomain()))}
          >
            {pending ? <Spinner /> : null} Periksa
          </Button>
        )}
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => startTransition(async () => report(await removeDomain()))}
        >
          Lepas domain
        </Button>
      </CardFooter>
    </Card>
  );
}
