# **Product Requirements Document (PRD)**

## **Smart Booking & Invoicing SaaS (Local-First)**

**Version:** 3.0 (Full Technical MVP Ready \- SaaS Subscription & OAuth Payment)

**Target Engine:** Claude Code / Cursor (Automated Generation)

### **1\. Product Overview & Business Model**

**Problem:** Micro-businesses di Indonesia (MUA, Fotografer, dll.) butuh automasi *booking* dan DP, namun platform tidak ingin mengambil risiko regulasi dengan menyimpan dana pengguna (holding funds).

**Solution:** Platform SaaS *Link-in-bio* di mana *merchant* menyewa sistem (berlangganan bulanan) dan menghubungkan akun Payment Gateway mereka sendiri via OAuth. Dana DP langsung masuk ke akun *merchant*.

**Pricing Tier:**

1. **Starter (Free):** Maksimal 10 transaksi/bulan, 1 jenis layanan, *Watermark* platform.  
2. **Pro (Rp 79.000/bln):** Unlimited transaksi & layanan, WhatsApp Reminder, Bebas Watermark, Custom Theme.  
3. **Studio (Rp 199.000/bln):** Multi-staff, Analytics, Custom Domain.

### **2\. Core Features (MVP Scope)**

#### **2.1. Customer Booking Funnel (Public-Facing \- Mobile First)**

* **Dynamic URL:** \[domain\]/\[merchant\_username\]  
* **Step 1: Service Selection:** Menampilkan layanan (cek limit langganan *merchant*).  
* **Step 2: Scheduling:** Date & Time picker dengan disable waktu yang sudah terisi.  
* **Step 3: Checkout:** Form Nama & WhatsApp.  
* **Step 4: Payment:** Menampilkan QRIS (di-*generate* menggunakan API Key *merchant*). Polling status pembayaran.

#### **2.2. Merchant Dashboard (Private \- Desktop Optimized)**

* **Auth:** Login via Supabase.  
* **Billing/Subscription:** Halaman untuk *upgrade* paket SaaS (bayar ke platform).  
* **Payment Integration (OAuth Connect):** Tombol "Connect Midtrans/Xendit" agar *merchant* bisa menerima pembayaran langsung (menyimpan *Access Token/Server Key* mereka secara aman).  
* **Service & Availability:** CRUD layanan dan mengatur jam kerja.  
* **Ledger:** Tabel melihat *booking* masuk.

### **3\. Technical Architecture**

* **Frontend & Backend:** Next.js 14/15 (App Router), Tailwind CSS, Shadcn UI.  
* **Database & Auth:** Supabase (PostgreSQL) dengan @supabase/ssr dan RLS.  
* **Payment Gateway:** Midtrans / Xendit (OAuth Connect / Platform API untuk *merchant*).  
* **Notification Engine:** Node.js Baileys di VPS (WhatsApp Gateway) / Upstash QStash.  
* **Cron/Background Jobs:** Vercel Cron (untuk auto-cancel *booking* unpaid \> 15 menit).

### **4\. Database Schema & RLS (Supabase)**

**Table 1: merchants**

* id (uuid, PK, references auth.users)  
* username (text, unique)  
* full\_name, whatsapp\_number, bio, avatar\_url  
* subscription\_tier (enum: 'STARTER', 'PRO', 'STUDIO')  
* payment\_access\_token (text, encrypted/secure) \- *Token dari Midtrans/Xendit*  
* *RLS:* SELECT public, UPDATE only owner.

**Table 2: services**

* id (uuid, PK), merchant\_id (uuid, FK)  
* name (text), price (numeric), duration\_minutes (integer)  
* *RLS:* SELECT public, ALL only owner.

**Table 3: availability**

* id (uuid, PK), merchant\_id (uuid, FK)  
* day\_of\_week (integer, 1-7), start\_time (time), end\_time (time)  
* *RLS:* SELECT public, ALL only owner.

**Table 4: bookings**

* id (uuid, PK), merchant\_id (uuid, FK), service\_id (uuid, FK)  
* start\_datetime (timestamptz), end\_datetime (timestamptz)  
* customer\_name, customer\_whatsapp  
* status (enum: 'PENDING', 'PAID', 'CANCELLED')  
* payment\_url (text)  
* created\_at (timestamptz)  
* *RLS:* SELECT owner (full), public (hanya cek bentrok), INSERT public (anon).

### **5\. Backend Logic (Critical Path \- API Routes)**

**A. Prevent Double-Booking (Concurrency Lock)**

* Endpoint: POST /api/bookings  
* **Logic:** Gunakan transaksi SQL FOR UPDATE di tabel bookings. Cek apakah start\_datetime dan end\_datetime beririsan dengan status IN ('PAID', 'PENDING'). Jika beririsan, *reject*.  
* **Payment Hit:** Jika kosong, baca payment\_access\_token milik merchant\_id, tembak API Midtrans untuk QRIS, insert ke DB, lalu *commit transaction*.

**B. Payment Webhook**

* Endpoint: POST /api/webhooks/payment  
* **Logic:** Terima webhook Midtrans \-\> Verifikasi \-\> Update bookings.status \= PAID \-\> Lempar *event* ke message queue (Upstash) untuk *trigger* WhatsApp Notifikasi agar response HTTP 200 cepat.

### **6\. Implementation Phases for AI (Prompting Guide)**

**Phase 1: Project Initialization & Scaffold**

* Setup Next.js App Router, Tailwind, Shadcn.  
* Konfigurasi Supabase Client & Middleware untuk perlindungan *route* admin.  
* **AI Prompt Instruction:** *Buat struktur folder standar SaaS dan siapkan skrip SQL untuk tabel dan RLS berdasarkan bagian 4\.*

**Phase 2: Auth & Merchant Onboarding**

* Buat halaman Login/Signup (Magic Link/Google).  
* Buat halaman Onboarding untuk mengisi *username* (URL slug).  
* Buat layout Dashboard (Sidebar \+ Main Content).

**Phase 3: Settings & Integrations (The SaaS Core)**

* **Halaman Billing:** Tampilkan paket langganan.  
* **Halaman Payment Setup:** UI untuk menginput atau mengkoneksikan akun Midtrans (menyimpan payment\_access\_token).  
* **Halaman Services & Hours:** CRUD tabel services dan availability. Limitasi *services* berdasarkan subscription\_tier.

**Phase 4: Public Booking Page (UI/UX)**

* Dynamic route app/\[username\]/page.tsx.  
* Render Service Card \-\> Date/Time Picker (Fetch jam kosong) \-\> Checkout Form \-\> UI Polling QRIS.  
* **AI Prompt Instruction:** *Gunakan pendekatan mobile-first (max-w-md), desain minimalis, dan validasi Zod untuk form.*

**Phase 5: Booking Engine & Concurrency (Backend)**

* Implementasi POST /api/bookings.  
* Tulis raw SQL query untuk eksekusi *Pessimistic Locking* (Anti double-booking).  
* Integrasikan fungsi tembak API Midtrans menggunakan kredensial milik *merchant*.

**Phase 6: Webhook, Polling, & Cron Jobs**

* Implementasi POST /api/webhooks/payment untuk menerima status Midtrans.  
* Buat UI Frontend melakukan SWR / React Query *polling* tiap 3 detik untuk mengecek status.  
* Konfigurasi /api/cron/cancel-unpaid menggunakan Vercel Cron (jalan tiap 5 menit, batalkan *booking* status PENDING yang umurnya \> 15 menit).