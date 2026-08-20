"use client";

import { GripVertical, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MEDIA_LIMITS } from "@/lib/media/limits";

export type FaqDraft = { id: string; question: string; answer: string };

/**
 * Daftar FAQ yang bisa disusun merchant.
 *
 * Keadaan kosong sengaja menyebut akibatnya secara gamblang: inilah satu-satunya
 * tempat merchant bisa tahu bahwa bagian FAQ memang tidak akan muncul sama
 * sekali di halamannya selama ini kosong.
 */
export function FaqEditor({
  faqs,
  onChange,
}: {
  faqs: FaqDraft[];
  onChange: (faqs: FaqDraft[]) => void;
}) {
  const penuh = faqs.length >= MEDIA_LIMITS.maxFaqs;

  const ubah = (id: string, bagian: Partial<FaqDraft>) =>
    onChange(faqs.map((faq) => (faq.id === id ? { ...faq, ...bagian } : faq)));

  const hapus = (id: string) => onChange(faqs.filter((faq) => faq.id !== id));

  const geser = (index: number, arah: -1 | 1) => {
    const tujuan = index + arah;
    if (tujuan < 0 || tujuan >= faqs.length) return;
    const salinan = [...faqs];
    [salinan[index], salinan[tujuan]] = [salinan[tujuan], salinan[index]];
    onChange(salinan);
  };

  return (
    <div className="flex flex-col gap-3">
      {faqs.length === 0 ? (
        <p className="text-muted-foreground border-border border border-dashed p-4 text-sm text-pretty">
          Belum ada pertanyaan. Selama kosong, bagian FAQ tidak muncul sama sekali di
          halaman Anda.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {faqs.map((faq, index) => (
            <li key={faq.id} className="border-border flex flex-col gap-2 border p-3">
              <div className="flex items-center gap-2">
                <GripVertical
                  className="text-muted-foreground size-4 shrink-0"
                  aria-hidden
                />
                <Input
                  value={faq.question}
                  onChange={(e) => ubah(faq.id, { question: e.target.value })}
                  placeholder="Apakah bisa reschedule?"
                  maxLength={200}
                  aria-label={`Pertanyaan ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => hapus(faq.id)}
                  aria-label={`Hapus pertanyaan ${index + 1}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <Textarea
                value={faq.answer}
                onChange={(e) => ubah(faq.id, { answer: e.target.value })}
                placeholder="Bisa, hubungi kami lewat WhatsApp maksimal H-2."
                maxLength={1000}
                rows={3}
                aria-label={`Jawaban ${index + 1}`}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => geser(index, -1)}
                  disabled={index === 0}
                >
                  Naik
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => geser(index, 1)}
                  disabled={index === faqs.length - 1}
                >
                  Turun
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={penuh}
          onClick={() =>
            onChange([
              ...faqs,
              { id: crypto.randomUUID(), question: "", answer: "" },
            ])
          }
        >
          <Plus className="size-4" />
          Tambah pertanyaan
        </Button>
        {penuh ? (
          <span className="text-muted-foreground text-xs">
            Maksimal {MEDIA_LIMITS.maxFaqs} pertanyaan
          </span>
        ) : null}
      </div>
    </div>
  );
}
