# Notifikasi: email dan WhatsApp

Booka mengirim tiga jenis pesan:

| Kapan | Ke siapa | Kanal | Paket |
| --- | --- | --- | --- |
| DP dibayar | Merchant | Email + WhatsApp | Semua |
| DP dibayar | Pelanggan | WhatsApp | Semua |
| H-1, pukul 08:00 WIB | Pelanggan | WhatsApp | Pro, Studio |

Semua kanal **opsional**. Kanal tanpa konfigurasi dilewati dan tercatat
`SKIPPED` di tabel `notification_log` — webhook pembayaran tidak pernah gagal
gara-gara notifikasi. Riwayat pengiriman per booking terlihat di dialog
detail booking di dashboard.

Setiap pesan dikirim paling banyak sekali: unique `(booking_id, kind,
channel)` di `notification_log` menjaganya walau gateway me-retry webhook atau
cron terpanggil ulang.

## Email (Resend, gratis)

1. Daftar di resend.com. Paket gratisnya cukup untuk tahap awal.
2. **Domains → Add domain**, lalu pasang record DNS yang diminta. Tanpa domain
   terverifikasi, Resend hanya mengizinkan kirim ke email pemilik akun.
3. **API Keys → Create** dengan izin *Sending access*.
4. Isi di Vercel (Project → Settings → Environment Variables):

   ```
   RESEND_API_KEY=re_...
   EMAIL_FROM=Booka <notifikasi@domainanda.id>
   ```

### Sekalian: SMTP Supabase

SMTP bawaan Supabase hanya untuk uji coba dan dibatasi beberapa email per jam
— pendaftaran, reset password, dan Magic Link akan macet begitu ramai.
Pakai kunci Resend yang sama:

**Supabase → Authentication → Emails → SMTP Settings → Enable custom SMTP**

| Isian | Nilai |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | API key Resend |
| Sender email | alamat di domain terverifikasi |
| Sender name | `Booka` |

Setelah itu naikkan **Rate Limits → emails per hour** sesuai kebutuhan.

## WhatsApp (WAHA self-host, gratis)

WAHA adalah gateway WhatsApp open-source. Ia **bukan API resmi** WhatsApp:
nomor pengirim bisa diblokir kalau dianggap spam. Karena itu:

- Pakai **nomor khusus Booka**, jangan nomor pribadi.
- Booka hanya mengirim pesan transaksional ke orang yang baru saja memesan,
  dengan jeda antarpesan. Jangan pakai nomor ini untuk siaran promosi.
- Kalau nanti sudah ada pemasukan, pindah ke penyedia resmi cukup dengan
  mengganti env (lihat "Ganti penyedia").

### 1. Server

Gateway harus menyala 24 jam dan memegang sesi WhatsApp — tidak bisa di
Vercel. Pilihan gratis: **Oracle Cloud Always Free** (VM ARM Ampere). VPS
murah mana pun juga bisa. Pasang Docker di sana.

### 2. Jalankan WAHA

Salin folder `deploy/whatsapp-gateway/` ke VPS, lalu:

```bash
cp .env.example .env   # isi WAHA_API_KEY (openssl rand -hex 24) dan kata sandi
docker compose up -d
```

### 3. HTTPS tanpa membuka port: Cloudflare Tunnel (gratis)

Vercel memanggil gateway lewat internet, dan API key ikut dalam header —
jadi wajib HTTPS. Cara termudah tanpa sertifikat dan tanpa membuka port:

```bash
# di VPS, setelah login ke akun Cloudflare yang mengelola domain Anda
cloudflared tunnel login
cloudflared tunnel create booka-wa
cloudflared tunnel route dns booka-wa wa.domainanda.id
cloudflared tunnel run --url http://localhost:3000 booka-wa
```

Jalankan `cloudflared` sebagai service supaya ikut menyala saat VPS reboot.
Setelah tunnel jalan, port 3000 di firewall VPS boleh ditutup.

### 4. Hubungkan nomor

Buka `https://wa.domainanda.id/dashboard`, login dengan kredensial dashboard
dari `.env`, start sesi `default`, lalu scan QR dari WhatsApp di HP nomor
Booka (**Perangkat tertaut → Tautkan perangkat**).

### 5. Isi env di Vercel

```
WHATSAPP_PROVIDER=waha
WHATSAPP_API_URL=https://wa.domainanda.id
WHATSAPP_API_KEY=<nilai WAHA_API_KEY>
WHATSAPP_SESSION=default
```

Redeploy agar env baru terbaca.

### Ganti penyedia

| Penyedia | `WHATSAPP_PROVIDER` | `WHATSAPP_API_URL` | `WHATSAPP_API_KEY` | `WHATSAPP_SESSION` |
| --- | --- | --- | --- | --- |
| WAHA (self-host) | `waha` | URL gateway | `WAHA_API_KEY` | nama sesi |
| Evolution API (self-host) | `evolution` | URL gateway | `AUTHENTICATION_API_KEY` | nama instance |
| Fonnte (berbayar) | `fonnte` | — | token perangkat | — |

Adapternya ada di `src/lib/notify/whatsapp.ts`. Menambah penyedia lain (mis.
WhatsApp Cloud API resmi) cukup menambah satu cabang di sana.

## Reminder H-1

Cron `/api/cron/reminders` jalan setiap hari pukul 01:00 UTC (08:00 WIB) dan
mengingatkan semua booking PAID yang jadwalnya besok, khusus merchant Pro dan
Studio. Butuh `CRON_SECRET` yang sama dengan cron pembatalan.

Uji manual:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://domainanda.id/api/cron/reminders
```
