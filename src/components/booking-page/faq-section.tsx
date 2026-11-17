import type { MerchantFaq } from "@/types/database";

/**
 * FAQ memakai <details>/<summary> asli, bukan accordion ber-JavaScript:
 * bisa dibuka tanpa hidrasi, sudah benar secara aksesibilitas dan keyboard,
 * dan tidak menambah satu byte pun JS ke halaman yang tugasnya mengubah
 * pengunjung jadi pesanan.
 *
 * Mengembalikan null saat merchant belum mengisi FAQ. Bagiannya memang TIDAK
 * ADA di HTML -- bukan disembunyikan lewat CSS -- sehingga tidak ada judul,
 * ikon, atau elemen kosong yang tersisa.
 */
export function BookingFaqSection({ faqs }: { faqs: MerchantFaq[] }) {
  if (faqs.length === 0) return null;

  return (
    <section
      aria-labelledby="faq-heading"
      className="bg-card border-border flex flex-col gap-3 border p-4"
      style={{ borderRadius: "var(--radius)" }}
    >
      <h2
        id="faq-heading"
        className="text-sm font-medium"
      >
        Pertanyaan umum
      </h2>
      <ul className="flex flex-col gap-2">
        {faqs.map((faq) => (
          <li key={faq.id} className="border-border border">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium">
                {faq.question}
                <span
                  aria-hidden
                  className="text-muted-foreground shrink-0 transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="text-muted-foreground px-4 pb-4 text-sm text-pretty whitespace-pre-line">
                {faq.answer}
              </p>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
