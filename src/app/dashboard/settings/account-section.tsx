"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Download, Trash2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import { deleteAccount, type DeleteAccountState } from "./account-actions";

const INITIAL_STATE: DeleteAccountState = { status: "idle" };

function DeleteSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={disabled || pending}>
      {pending ? <Spinner /> : <Trash2 />} Hapus permanen
    </Button>
  );
}

/** Ekspor data dan hapus akun -- hak merchant atas datanya sendiri (UU PDP). */
export function AccountSection({ username }: { username: string }) {
  const [state, formAction] = useActionState(deleteAccount, INITIAL_STATE);
  const [confirmation, setConfirmation] = useState("");
  const matches = confirmation.trim().toLowerCase() === username;

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Unduh data Anda</CardTitle>
          <CardDescription>
            Salinan profil, layanan, jam kerja, FAQ, dan seluruh riwayat booking dalam satu
            berkas JSON.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" asChild>
            <a href="/dashboard/settings/ekspor" download>
              <Download /> Unduh data
            </a>
          </Button>
        </CardFooter>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle>Hapus akun</CardTitle>
          <CardDescription>
            Akun, halaman booking, layanan, riwayat booking, dan semua foto yang Anda unggah
            dihapus permanen. Tindakan ini tidak bisa dibatalkan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 /> Hapus akun
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form action={formAction} className="flex flex-col gap-4">
                <DialogHeader>
                  <DialogTitle>Hapus akun secara permanen?</DialogTitle>
                  <DialogDescription>
                    Tautan booka Anda langsung berhenti berfungsi. Unduh data Anda dulu bila
                    masih membutuhkannya.
                  </DialogDescription>
                </DialogHeader>
                <Field>
                  <FieldLabel htmlFor="confirmation">
                    Ketik <span className="font-mono">{username}</span> untuk konfirmasi
                  </FieldLabel>
                  <Input
                    id="confirmation"
                    name="confirmation"
                    autoComplete="off"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </Field>
                {state.status === "error" ? (
                  <Alert variant="destructive">
                    <AlertDescription>{state.message}</AlertDescription>
                  </Alert>
                ) : null}
                <DialogFooter>
                  <DeleteSubmit disabled={!matches} />
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
