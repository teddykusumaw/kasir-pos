# Kasir POS

Sistem Point of Sale (POS) modern untuk toko/retail: kasir, warehouse, laporan keuangan, PPN, hutang/piutang, forecast restock, serta notifikasi **WhatsApp** & **Telegram**.

**Stack:** Next.js 15 (App Router) · Tailwind CSS · Supabase (Auth + PostgreSQL + RLS) · TypeScript

---

## Daftar Isi

1. [Fitur Utama](#fitur-utama)
2. [Stack & Dependensi](#stack--dependensi)
3. [Struktur Project](#struktur-project)
4. [Setup Cepat](#setup-cepat)
5. [Migrasi Database](#migrasi-database)
6. [Role & Hak Akses](#role--hak-akses)
7. [Modul Detail](#modul-detail)
8. [Printer & ESC/POS](#printer--escpos)
9. [Notifikasi](#notifikasi)
10. [Environment Variables](#environment-variables)
11. [Deploy (GitHub + Vercel)](#deploy-github--vercel)
12. [Scripts](#scripts)
13. [Catatan Produksi](#catatan-produksi)

---

## Fitur Utama

### Autentikasi & Multi-User
- Login email/password (Supabase Auth)
- Role **Admin** & **Kasir**
- Admin dapat menambah user
- Semua user dapat ganti password sendiri
- Row Level Security (RLS) di Supabase

### Kasir / POS
- Keranjang belanja, ubah qty, hapus item
- Metode bayar: **Tunai**, **QRIS**, **Transfer**, **Kartu**, **Tempo**
- Penjualan **Tempo** → otomatis membuat **piutang** (+30 hari jatuh tempo)
- PPN otomatis (exclusive / inclusive / nonaktif)
- Smart barcode scanner (`onscan.js`) — bedakan scanner vs ketikan manual
- Cetak struk: Web Serial (USB), Web Bluetooth (BLE), Browser print
- Auto-print & ticket dapur (opsional)
- Stok berkurang otomatis (trigger + FIFO batch)

### Produk (Admin)
- CRUD produk: nama, barcode, harga, **cost**, stok, min stok, kategori, unit
- Status **Aktif / Nonaktif** (nonaktif disembunyikan di POS)
- Restock menambah **batch FIFO** untuk HPP akurat

### Warehouse
- Daftar stok, filter menipis/habis/aman, kategori, pencarian
- Status stok + status item
- Export **PDF** & **CSV**
- Tab **Forecast Restock** (lihat di bawah)

### Dashboard
- Omzet & jumlah transaksi hari ini
- Grafik penjualan (7 / 30 / 90 hari)
- Item terlaris
- Alert stok menipis

### Laporan Penjualan
- Filter rentang tanggal & metode bayar
- Subtotal, PPN, total per transaksi
- Export PDF & CSV

### Laporan Keuangan
| Laporan | Isi |
|---------|-----|
| **Laba Rugi** | Pendapatan (DPP), HPP/COGS, laba kotor, beban, laba bersih, margin |
| **Laporan Kas** | Penerimaan per metode, pengeluaran, estimasi kas tunai |
| **Cash Flow** | Arus operasi, tabel harian, proyeksi 30 hari, peringatan |
| **Neraca** | Kas, piutang, persediaan, hutang, modal, laba ditahan + **Export Excel** |
| **Beban** | Input beban operasional (kategori preset) |
| **Hutang / Piutang** | CRUD, status lunas, **pelunasan otomatis FIFO** |

### PPN
- Tarif dapat diubah (mis. 11% → 12%) oleh Admin
- Mode **Exclusive** (PPN ditambah) / **Inclusive** (harga sudah termasuk PPN)
- Disimpan per transaksi (`tax_rate`, `tax_amount`, `subtotal`)

### FIFO Inventory
- Tabel `stock_batches` (qty, unit cost, tanggal masuk)
- Penjualan mengurangi batch **tertua dulu**
- HPP di `sale_items.cost` mengikuti alokasi FIFO
- Event **sold-out** dicatat untuk forecast

### Forecast Restock
- Deret penjualan harian (termasuk hari 0)
- Exponential smoothing + tren mingguan
- Safety stock (service level ~95%)
- Skor sold-out (frekuensi + recency)
- Prioritas: critical / high / medium
- Confidence: high / medium / low
- Parameter: jendela analisa, target cover, lead time
- Kirim alert: WhatsApp, Telegram, atau **keduanya**

### Notifikasi
| Channel | Provider |
|---------|----------|
| **WhatsApp** | Meta Cloud API (WhatsApp Business), Fonnte, Webhook, link wa.me |
| **Telegram** | Bot API + **Webhook** (`/api/telegram/webhook`) |

---

## Stack & Dependensi

| Teknologi | Fungsi |
|-----------|--------|
| Next.js 15 | App Router, API routes |
| React 19 | UI |
| Tailwind CSS | Styling |
| Supabase | Auth, DB, RLS |
| onscan.js | Barcode scanner |
| jspdf + autotable | Export PDF |
| recharts | Grafik dashboard |
| lucide-react | Ikon |

Printer thermal: builder ESC/POS murni (`lib/escpos.ts`) + Web Serial / Web Bluetooth (tanpa QZ Tray).

---

## Struktur Project

```text
kasir-pos/
├── app/
│   ├── api/
│   │   ├── notify/whatsapp/     # Proxy kirim WA (opsional)
│   │   ├── notify/telegram/
│   │   └── telegram/webhook/    # Webhook Bot Telegram
│   ├── dashboard/
│   ├── pos/
│   ├── products/
│   ├── warehouse/
│   ├── reports/
│   ├── users/
│   ├── settings/
│   └── login/
├── components/                  # UI clients (POS, laporan, forecast, dll.)
├── hooks/useBarcodeScanner.ts
├── lib/
│   ├── escpos.ts                # Builder struk thermal
│   ├── fifo.ts                  # FIFO stock batches
│   ├── forecast.ts              # Algoritma restock
│   ├── finance.ts               # Laba rugi, kas, CF, neraca
│   ├── taxSettings.ts           # PPN
│   ├── whatsapp.ts
│   ├── telegram.ts
│   ├── notify.ts                # WA + TG terpadu
│   ├── debtAuto.ts              # Pelunasan FIFO
│   ├── cashFlowAnalysis.ts
│   ├── exportExcel.ts
│   └── ...
├── supabase/
│   ├── schema.sql               # Schema utama
│   ├── migration_finance.sql
│   ├── migration_ar_ap.sql      # Hutang/piutang
│   ├── migration_tempo_ar.sql
│   ├── migration_fifo_whatsapp.sql
│   └── migration_telegram.sql
├── types/database.ts
└── README.md
```

---

## Setup Cepat

### 1. Clone & install

```bash
git clone https://github.com/USERNAME/kasir-pos.git
cd kasir-pos
cp .env.example .env.local
npm install
```

### 2. Supabase

1. Buat project di [supabase.com](https://supabase.com)
2. SQL Editor → jalankan `supabase/schema.sql`
3. Jalankan file migrasi tambahan (urut disarankan):

```text
migration_finance.sql
migration_ar_ap.sql
migration_tempo_ar.sql
migration_fifo_whatsapp.sql
migration_telegram.sql
```

4. Authentication → Users → **Add user** (admin)
5. Table `profiles` → set `role = admin`

### 3. Environment

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

### 4. Jalankan

```bash
npm run dev
# atau dengan Turbopack:
# npm run dev  → script "next dev --turbopack"
```

Buka [http://localhost:3000](http://localhost:3000)

---

## Migrasi Database

| File | Isi |
|------|-----|
| `schema.sql` | profiles, products, sales, sale_items, RLS, trigger stok |
| `migration_finance.sql` | PPN columns, expenses, app_settings |
| `migration_ar_ap.sql` | receivables, payables |
| `migration_tempo_ar.sql` | metode `tempo`, `sale_id` di piutang |
| `migration_fifo_whatsapp.sql` | stock_batches, stockout_events, setting WA |
| `migration_telegram.sql` | default setting Telegram |

> Project baru: idealnya gabungkan / jalankan semua. Project lama: jalankan hanya migrasi yang belum di-apply.

---

## Role & Hak Akses

| Fitur | Admin | Kasir |
|-------|-------|-------|
| Dashboard, POS, Warehouse, Laporan | ✅ | ✅ |
| Produk, Pengguna | ✅ | ❌ |
| Ubah PPN, saldo awal, WA/Telegram | ✅ | ❌ |
| Input beban, hutang/piutang | ✅ | Lihat (tergantung policy) |
| Ganti password sendiri | ✅ | ✅ |

---

## Modul Detail

### POS — Metode Bayar

| Metode | Perilaku |
|--------|----------|
| Tunai | Input uang diterima + kembalian |
| QRIS / Transfer / Kartu | Total = tagihan |
| Tempo | Wajib nama pelanggan → buat **piutang** otomatis |

### PPN

| Mode | Contoh harga item 100.000, tarif 11% |
|------|--------------------------------------|
| Exclusive | Subtotal 100.000 + PPN 11.000 = **111.000** |
| Inclusive | Total 100.000 (PPN dipecah di struk) |

Ubah di **Pengaturan → PPN** (hanya Admin). Transaksi lama tetap menyimpan tarif saat itu.

### Hutang / Piutang

- Status: open · partial · paid · cancelled
- **Pelunasan otomatis FIFO**: nominal dialokasikan ke tagihan kontak yang sama, urut jatuh tempo
- Piutang masuk **Aset** di neraca; hutang masuk **Kewajiban**

### Forecast Restock

```text
saran ≈ forecast×cover + forecast×lead + safety_stock + buffer_soldout − stok
```

Lokasi: **Warehouse → Forecast Restock**

---

## Printer & ESC/POS

| Metode | Keterangan |
|--------|------------|
| **Web Serial** | USB thermal, Chrome/Edge, HTTPS/localhost |
| **Web Bluetooth** | Printer **BLE** (bukan Classic SPP) |
| **Browser** | Dialog print OS |

Konfigurasi (Pengaturan): lebar kertas 32/42/48, baud rate, auto-cut, cash drawer, auto-print, ticket dapur.

---

## Notifikasi

### WhatsApp

| Provider | Kebutuhan |
|----------|-----------|
| **Meta Cloud API** | Phone Number ID + Permanent Token |
| **Fonnte** | API token |
| **Webhook** | URL POST `{ phone, message }` |
| **Link wa.me** | Tanpa API (buka chat manual) |

### Telegram

1. Buat bot via **@BotFather** → salin token  
2. Chat bot / masukkan ke grup → dapatkan **Chat ID** (`/id` atau @userinfobot)  
3. Pengaturan → Telegram → Simpan → **Tes kirim**

**Webhook (production):**

```env
TELEGRAM_WEBHOOK_SECRET=random-secret
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

Set webhook setelah deploy:

```text
GET /api/telegram/webhook?secret=SECRET&action=set
```

Perintah bot: `/start` `/help` `/status` `/id`

### Kirim dari aplikasi

Forecast → **Kirim WA** | **Kirim Telegram** | **Kirim Semua** (`lib/notify.ts`)

---

## Environment Variables

| Variable | Wajib | Keterangan |
|----------|-------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Ya | URL project Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Ya | Anon/public key |
| `NEXT_PUBLIC_APP_URL` | Produksi | Base URL publik (webhook TG) |
| `TELEGRAM_WEBHOOK_SECRET` | Opsional | Proteksi webhook |
| `SUPABASE_SERVICE_ROLE_KEY` | Opsional | Webhook simpan chat_id (server) |

Jangan commit `.env.local`.

---

## Deploy (GitHub + Vercel)

```bash
git init
git add .
git commit -m "Initial commit: Kasir POS"
git branch -M main
git remote add origin https://github.com/USERNAME/kasir-pos.git
git push -u origin main
```

1. [vercel.com](https://vercel.com) → Import repo  
2. Isi Environment Variables (Supabase + opsional Telegram)  
3. Deploy  
4. Supabase Auth → **Site URL** & **Redirect URLs** = domain Vercel  

Web Serial / Bluetooth membutuhkan **HTTPS** (Vercel sudah HTTPS).

---

## Scripts

```bash
npm run dev          # Development (Turbopack jika dikonfigurasi)
npm run dev:webpack  # Fallback Webpack
npm run build        # Production build
npm run start        # Jalankan hasil build
npm run lint         # ESLint
```

---

## Catatan Produksi

| Topik | Catatan |
|-------|---------|
| **Hydration** | Preferensi printer/localStorage hanya di-load setelah mount |
| **Tempo ≠ kas** | Penjualan tempo tidak dihitung penerimaan kas sampai piutang dilunasi |
| **HPP** | Isi **cost** produk + migrasi FIFO agar laba akurat |
| **Meta WA** | Mode development: nomor penerima harus di allow-list |
| **RLS** | Pastikan policy Supabase sesuai role sebelum go-live |
| **Backup** | Aktifkan backup database Supabase untuk data transaksi |

---

## Lisensi

Private / sesuai kebutuhan pemilik repositori.

---

## Kontribusi

1. Fork / branch fitur  
2. Test alur: login → produk → POS → stok → laporan  
3. Pull request dengan deskripsi jelas  

---

**Kasir POS** — kasir, stok, keuangan, dan notifikasi dalam satu aplikasi.
