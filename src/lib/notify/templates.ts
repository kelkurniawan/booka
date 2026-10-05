import { formatDateTime, formatRupiah } from "@/lib/format";

/**
 * Data yang dibutuhkan semua templat. Sengaja datar dan berisi string jadi,
 * supaya templat murni (tanpa I/O) dan bisa diuji tanpa database.
 */
export type BookingMessageData = {
  merchantName: string;
  /** Nomor WhatsApp merchant (+62…) untuk dihubungi pelanggan, bila diisi. */
  merchantWhatsapp: string | null;
  customerName: string;
  customerWhatsapp: string;
  serviceName: string;
  servicePrice: number;
  startDatetime: string;
  /** Nama staf yang menangani, khusus paket Studio. */
  staffName?: string | null;
  /** URL absolut /pesanan/{token} milik pelanggan. */
  statusUrl: string;
  /** URL absolut daftar booking di dashboard merchant. */
  dashboardUrl: string;
};

export type EmailMessage = { subject: string; text: string; html: string };

function when(data: BookingMessageData): string {
  return `${formatDateTime(data.startDatetime)} WIB`;
}

/** Nomor +62… menjadi tautan wa.me yang bisa diklik dari email/WA. */
export function waLink(e164: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}`;
}

function staffLine(data: BookingMessageData): string | null {
  return data.staffName ? `Staf: ${data.staffName}` : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Email ke merchant: ada booking baru yang DP-nya sudah dibayar. */
export function merchantPaidEmail(data: BookingMessageData): EmailMessage {
  const rows: [string, string][] = [
    ["Layanan", data.serviceName],
    ["Jadwal", when(data)],
    ...(data.staffName ? ([["Staf", data.staffName]] as [string, string][]) : []),
    ["Pelanggan", data.customerName],
    ["WhatsApp", data.customerWhatsapp],
    ["DP diterima", formatRupiah(data.servicePrice)],
  ];

  const text = [
    `Booking baru di ${data.merchantName} sudah dibayar.`,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `Chat pelanggan: ${waLink(data.customerWhatsapp)}`,
    `Lihat di dashboard: ${data.dashboardUrl}`,
  ].join("\n");

  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#18181b">
<p>Booking baru di <strong>${escapeHtml(data.merchantName)}</strong> sudah dibayar.</p>
<table style="border-collapse:collapse">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#71717a">${escapeHtml(label)}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`,
    )
    .join("")}</table>
<p><a href="${escapeHtml(waLink(data.customerWhatsapp))}">Chat pelanggan di WhatsApp</a> · <a href="${escapeHtml(data.dashboardUrl)}">Buka dashboard</a></p>
</div>`;

  return {
    subject: `Booking baru: ${data.customerName} — ${data.serviceName}, ${formatDateTime(data.startDatetime)}`,
    text,
    html,
  };
}

/** WhatsApp ke merchant: versi ringkas dari email di atas. */
export function merchantPaidWhatsapp(data: BookingMessageData): string {
  return [
    `*Booking baru sudah dibayar*`,
    `${data.serviceName} · ${when(data)}`,
    staffLine(data),
    `Pelanggan: ${data.customerName} (${data.customerWhatsapp})`,
    `DP: ${formatRupiah(data.servicePrice)}`,
    "",
    data.dashboardUrl,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/** WhatsApp ke pelanggan: konfirmasi pembayaran + tautan bukti. */
export function customerPaidWhatsapp(data: BookingMessageData): string {
  return [
    `Halo ${data.customerName}, pembayaran DP untuk *${data.serviceName}* di *${data.merchantName}* sudah diterima.`,
    "",
    `Jadwal: ${when(data)}`,
    staffLine(data),
    "",
    `Detail dan bukti pembayaran: ${data.statusUrl}`,
    data.merchantWhatsapp ? `Pertanyaan? Hubungi ${data.merchantName}: ${waLink(data.merchantWhatsapp)}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/** WhatsApp ke pelanggan sehari sebelum jadwal (paket Pro ke atas). */
export function customerReminderWhatsapp(data: BookingMessageData): string {
  return [
    `Halo ${data.customerName}, pengingat jadwal *${data.serviceName}* di *${data.merchantName}* besok:`,
    "",
    when(data),
    staffLine(data),
    "",
    `Detail: ${data.statusUrl}`,
    data.merchantWhatsapp
      ? `Perlu ubah jadwal? Hubungi ${data.merchantName}: ${waLink(data.merchantWhatsapp)}`
      : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}
