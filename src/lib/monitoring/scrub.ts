/**
 * Menyensor data yang tidak boleh keluar ke layanan pemantauan error.
 *
 * Token akses booking ada di PATH URL /pesanan/{token} (DECISIONS.md #18):
 * siapa pun yang memegang URL itu bisa membuka data pelanggan. URL request,
 * nama transaksi, dan breadcrumb navigasi semuanya bisa membawa path itu ke
 * Sentry, jadi semuanya dilewatkan ke sini.
 */
const BOOKING_TOKEN_PATH = /\/pesanan\/[^/?#\s"']+/g;
/** Nomor telepon Indonesia/E.164 yang ikut di pesan error (mis. dari gateway). */
const PHONE = /\+?62\d{7,13}\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function scrubText(value: string): string {
  return value
    .replace(BOOKING_TOKEN_PATH, "/pesanan/[token]")
    .replace(PHONE, "[nomor]")
    .replace(EMAIL, "[email]");
}

type Scrubbable = {
  request?: { url?: string; query_string?: unknown; cookies?: unknown; headers?: unknown; data?: unknown };
  transaction?: string;
  message?: string;
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: { message?: string; data?: Record<string, unknown> }[];
  user?: unknown;
};

/**
 * Dipakai sebagai `beforeSend` di semua runtime. Memodifikasi event di
 * tempat lalu mengembalikannya (kontrak Sentry). Body, cookie, header, dan
 * query request dibuang seluruhnya -- terlalu banyak tempat data pelanggan
 * bisa terselip untuk disensor satu per satu.
 */
export function scrubEvent<T extends Scrubbable>(event: T): T {
  if (event.request) {
    if (event.request.url) event.request.url = scrubText(event.request.url);
    delete event.request.query_string;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
  }
  if (event.transaction) event.transaction = scrubText(event.transaction);
  if (event.message) event.message = scrubText(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value);
  }
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = scrubText(crumb.message);
    if (crumb.data) {
      for (const [key, value] of Object.entries(crumb.data)) {
        if (typeof value === "string") crumb.data[key] = scrubText(value);
      }
    }
  }
  delete event.user;
  return event;
}
