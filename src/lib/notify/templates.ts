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
  /** Nominal yang dibayar lewat gateway (DP, atau penuh). */
  amountDueNow: number;
  /** Sisa yang dibayar di tempat; 0 bila lunas lewat gateway. */
  amountDueOnSite: number;
  /** ISO expires_at: batas jawab (permintaan) atau batas bayar (disetujui). */
  respondBefore: string | null;
  /** True bila sisa di tempat sudah ditandai lunas. */
  paidOnSite?: boolean;
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

function onSiteRow(data: BookingMessageData): [string, string][] {
  return data.amountDueOnSite > 0 ? [["Sisa di tempat", formatRupiah(data.amountDueOnSite)]] : [];
}

function onSiteLine(data: BookingMessageData): string | null {
  return data.amountDueOnSite > 0 ? `Sisa di tempat: ${formatRupiah(data.amountDueOnSite)}` : null;
}

function deadline(data: BookingMessageData): string | null {
  return data.respondBefore ? `${formatDateTime(data.respondBefore)} WIB` : null;
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
    ["Dibayar", formatRupiah(data.amountDueNow)],
    ...onSiteRow(data),
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
    `Dibayar: ${formatRupiah(data.amountDueNow)}`,
    onSiteLine(data),
    "",
    data.dashboardUrl,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/** WhatsApp ke pelanggan: konfirmasi pembayaran + tautan bukti. */
export function customerPaidWhatsapp(data: BookingMessageData): string {
  return [
    `Halo ${data.customerName}, pembayaran${data.amountDueOnSite > 0 ? " DP" : ""} untuk *${data.serviceName}* di *${data.merchantName}* sudah diterima.`,
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
    data.amountDueOnSite > 0 && !data.paidOnSite ? `Bayar di tempat: ${formatRupiah(data.amountDueOnSite)}` : null,
    "",
    `Detail: ${data.statusUrl}`,
    data.merchantWhatsapp
      ? `Perlu ubah jadwal? Hubungi ${data.merchantName}: ${waLink(data.merchantWhatsapp)}`
      : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function contactLine(data: BookingMessageData, prefix: string): string | null {
  return data.merchantWhatsapp ? `${prefix} ${data.merchantName}: ${waLink(data.merchantWhatsapp)}` : null;
}

function compact(lines: (string | null)[]): string {
  return lines.filter((line) => line !== null).join("\n");
}

/** Email ke merchant: booking bayar di tempat langsung terkonfirmasi. */
export function merchantConfirmedEmail(data: BookingMessageData): EmailMessage {
  const rows: [string, string][] = [
    ["Layanan", data.serviceName],
    ["Jadwal", when(data)],
    ...(data.staffName ? ([["Staf", data.staffName]] as [string, string][]) : []),
    ["Pelanggan", data.customerName],
    ["WhatsApp", data.customerWhatsapp],
    ["Bayar di tempat", formatRupiah(data.amountDueOnSite)],
  ];
  return simpleEmail(
    `Booking baru terkonfirmasi: ${data.customerName}, ${data.serviceName}, ${formatDateTime(data.startDatetime)}`,
    `Booking baru di ${data.merchantName} sudah terkonfirmasi. Pelanggan membayar di tempat.`,
    rows,
    data,
  );
}

/** Email ke merchant: ada permintaan booking yang perlu dijawab. */
export function merchantRequestedEmail(data: BookingMessageData): EmailMessage {
  const rows: [string, string][] = [
    ["Layanan", data.serviceName],
    ["Jadwal", when(data)],
    ...(data.staffName ? ([["Staf", data.staffName]] as [string, string][]) : []),
    ["Pelanggan", data.customerName],
    ["WhatsApp", data.customerWhatsapp],
    ...(deadline(data) ? ([["Jawab sebelum", deadline(data)!]] as [string, string][]) : []),
  ];
  return simpleEmail(
    `Permintaan booking: ${data.customerName}, ${data.serviceName}, ${formatDateTime(data.startDatetime)}`,
    `Ada permintaan booking baru di ${data.merchantName} yang menunggu jawaban Anda.`,
    rows,
    data,
  );
}

function simpleEmail(
  subject: string,
  intro: string,
  rows: [string, string][],
  data: BookingMessageData,
): EmailMessage {
  const text = [
    intro,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `Chat pelanggan: ${waLink(data.customerWhatsapp)}`,
    `Buka dashboard: ${data.dashboardUrl}`,
  ].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#18181b">
<p>${escapeHtml(intro)}</p>
<table style="border-collapse:collapse">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#71717a">${escapeHtml(label)}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`,
    )
    .join("")}</table>
<p><a href="${escapeHtml(waLink(data.customerWhatsapp))}">Chat pelanggan di WhatsApp</a> | <a href="${escapeHtml(data.dashboardUrl)}">Buka dashboard</a></p>
</div>`;
  return { subject, text, html };
}

export function merchantConfirmedWhatsapp(data: BookingMessageData): string {
  return compact([
    `*Booking baru terkonfirmasi*`,
    `${data.serviceName}, ${when(data)}`,
    staffLine(data),
    `Pelanggan: ${data.customerName} (${data.customerWhatsapp})`,
    `Bayar di tempat: ${formatRupiah(data.amountDueOnSite)}`,
    "",
    data.dashboardUrl,
  ]);
}

export function customerConfirmedWhatsapp(data: BookingMessageData): string {
  return compact([
    `Halo ${data.customerName}, booking *${data.serviceName}* di *${data.merchantName}* sudah terkonfirmasi.`,
    "",
    `Jadwal: ${when(data)}`,
    staffLine(data),
    `Bayar di tempat: ${formatRupiah(data.amountDueOnSite)}`,
    "",
    `Detail booking: ${data.statusUrl}`,
    contactLine(data, "Pertanyaan? Hubungi"),
  ]);
}

export function merchantRequestedWhatsapp(data: BookingMessageData): string {
  return compact([
    `*Permintaan booking baru*`,
    `${data.serviceName}, ${when(data)}`,
    staffLine(data),
    `Pelanggan: ${data.customerName} (${data.customerWhatsapp})`,
    deadline(data) ? `Jawab sebelum: ${deadline(data)}` : null,
    "",
    `Setujui atau tolak di: ${data.dashboardUrl}`,
  ]);
}

export function customerApprovedWhatsapp(data: BookingMessageData): string {
  return compact([
    `Halo ${data.customerName}, permintaan booking *${data.serviceName}* di *${data.merchantName}* disetujui.`,
    "",
    `Jadwal: ${when(data)}`,
    staffLine(data),
    `Bayar sekarang: ${formatRupiah(data.amountDueNow)}`,
    onSiteLine(data),
    deadline(data) ? `Batas bayar: ${deadline(data)}` : null,
    "",
    `Bayar lewat sini: ${data.statusUrl}`,
    contactLine(data, "Pertanyaan? Hubungi"),
  ]);
}

export function customerRejectedWhatsapp(data: BookingMessageData): string {
  return compact([
    `Halo ${data.customerName}, mohon maaf, permintaan booking *${data.serviceName}* di *${data.merchantName}* belum bisa kami terima.`,
    "",
    contactLine(data, "Untuk jadwal lain, hubungi"),
  ]);
}
