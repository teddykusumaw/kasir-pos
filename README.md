# Kasir POS

Sistem Point of Sale (POS) untuk toko/retail: kasir, warehouse, supplier, pembelian, batch stok & ED (FEFO/FIFO), laporan keuangan, PPN, hutang/piutang, forecast restock, notifikasi WhatsApp & Telegram.

**Stack:** Next.js 15 (App Router) · Tailwind CSS · Supabase (Auth + PostgreSQL + RLS) · TypeScript

---

## Daftar Isi

1. [Fitur Utama](#fitur-utama)
2. [Stack](#stack)
3. [Struktur Project](#struktur-project)
4. [Step-by-step: Jalankan dari Awal](#step-by-step-jalankan-dari-awal)
5. [Migrasi Database (urutan)](#migrasi-database-urutan)
6. [Role & Hak Akses](#role--hak-akses)
7. [Modul Detail](#modul-detail)
8. [Printer ESC/POS](#printer-escpos)
9. [Notifikasi](#notifikasi)
10. [Environment Variables](#environment-variables)
11. [GitHub & Vercel](#github--vercel)
12. [Scripts](#scripts)
13. [Clear Data / Reset](#clear-data--reset)
14. [Troubleshooting](#troubleshooting)

---

## Fitur Utama

### Autentikasi & Multi-User
- Login email/password (Supabase Auth)
- Role **Admin** & **Kasir**
- Admin menambah user; user ganti password sendiri
- **RLS** lengkap (`migration_rls_full.sql`)

### Kasir / POS
- Keranjang, qty, hapus item
- Bayar: Tunai, QRIS, Transfer, Kartu, **Tempo** (auto piutang)
- **PPN** exclusive / inclusive / off (tarif bisa diubah admin)
- Barcode scanner cerdas (`onscan.js`) + beep + debounce
- Cetak struk: Web Serial (USB), Web Bluetooth, browser print
- Ticket dapur (opsional)
- Stok turun **otomatis** (trigger `sale_items` + log `stock_movements`)
- HPP via **FIFO/FEFO** batch

### Produk (Admin)
- CRUD: nama, barcode, harga, cost, stok, min stok, unit, status
- Relasi **kategori** (master) & **supplier**
- Tab **Kategori** (CRUD master kategori)
- Restock → batch FIFO (+ optional ED)

### Supplier
- Master: nama, kontak, telepon, email, alamat, status
- Tab **Rekap & Hutang**: qty item, total beli, dibayar, sisa hutang + export Excel

### Pembelian (Admin)
- PO dari supplier: item, qty, modal, bayar sebagian/lunas
- Auto naik stok (trigger), batch FIFO, hutang (`payables`) jika sisa

### Warehouse
- Filter stok, kategori, **supplier**, rentang tanggal kirim
- Export PDF / CSV
- Tab **Forecast Restock**

### Batch Stok & ED (`/batches`)
- FEFO: ED terdekat dipakai dulu, lalu FIFO tanggal masuk
- Peringatan ED (7–90 hari)
- Kelola qty & tanggal kedaluwarsa per batch
- Tambah batch manual (admin)

### Dashboard
- Omzet & transaksi hari ini
- Grafik penjualan (rentang waktu)
- Item terlaris, alert stok menipis

### Laporan
| Modul | Isi |
|-------|-----|
| Penjualan | Filter tanggal/metode, PDF/CSV |
| Laba Rugi | DPP, HPP, beban, laba bersih |
| Kas | Penerimaan per metode, pengeluaran |
| Cash Flow | Arus harian, proyeksi, analisis |
| Neraca | Kas, piutang, stok, hutang + Excel |
| Beban | Kategori preset |
| Hutang/Piutang | CRUD + pelunasan FIFO |

### Forecast & Notifikasi
- Prediksi restock (smoothing + safety stock + skor sold-out)
- Alert WhatsApp (Meta Cloud / Fonnte) & Telegram (Bot + webhook)

### Printer
- ESC/POS murni (`lib/escpos.ts`) — tanpa QZ Tray
- Web Serial + Web Bluetooth + auto-print config

---

## Stack

| Teknologi | Fungsi |
|-----------|--------|
| Next.js 15 | App Router, API routes |
| React 19 | UI |
| Tailwind CSS | Styling |
| Supabase | Auth, DB, RLS |
| onscan.js | Barcode |
| jspdf / recharts | PDF & grafik |

---

## Struktur Project

```text
kasir-pos/
├── app/
│   ├── api/notify/...
│   ├── api/telegram/webhook/
│   ├── dashboard/ pos/ products/ warehouse/
│   ├── batches/ suppliers/ purchases/
│   ├── reports/ users/ settings/ login/
├── components/
├── hooks/useBarcodeScanner.ts
├── lib/
│   ├── escpos.ts, fifo.ts, stock.ts, forecast.ts
│   ├── finance.ts, taxSettings.ts, notify.ts
│   ├── supplierQueries.ts, webSerialPrinter.ts, ...
├── supabase/
│   ├── schema.sql
│   ├── migration_*.sql
│   └── migration_rls_full.sql
├── types/database.ts
└── README.md
```

---

## Step-by-step: Jalankan dari Awal

### A. Persiapan

1. Node.js 18+ dan akun [Supabase](https://supabase.com)
2. Clone / buka folder project:

```bash
cd kasir-pos
npm install
```

### B. Environment

Buat `.env.local` (jangan di-commit):

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

Ambil dari Supabase → **Project Settings → API**.

Opsional produksi:

```env
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
TELEGRAM_WEBHOOK_SECRET=random-secret
```

### C. Database

1. Supabase → **SQL Editor**
2. Jalankan migrasi **berurutan** (lihat [bagian migrasi](#migrasi-database-urutan))
3. **Authentication → Users → Add user** (email + password admin)
4. Pastikan baris di `profiles`:

```sql
INSERT INTO public.profiles (id, email, full_name, role)
VALUES (
  'USER_UUID_DARI_AUTH',
  'admin@email.com',
  'Admin',
  'admin'
)
ON CONFLICT (id) DO UPDATE SET role = 'admin';
```

5. Jalankan **`migration_rls_full.sql`** (policy RLS)

### D. Jalankan lokal

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) → login.

Dengan Turbopack (lebih cepat):

```bash
npx next dev --turbopack
```

### E. Alur data pertama

1. **Produk → Kategori** — buat kategori  
2. **Supplier** — buat pemasok  
3. **Produk** — tambah item (barcode, harga, cost, stok, kategori, supplier)  
4. **Batch & ED** — set tanggal ED batch (opsional)  
5. **POS** — jual / scan barcode  
6. **Warehouse / Laporan** — cek stok & omzet  

### F. Production build lokal

```bash
npm run build
npm start
```

---

## Migrasi Database (urutan)

Jalankan di SQL Editor **dari atas ke bawah** (lewati yang sudah pernah dijalankan):

| No | File | Isi |
|----|------|-----|
| 1 | `schema.sql` | Tabel inti: profiles, products, sales, sale_items, app_settings |
| 2 | `migration_finance.sql` | Beban, field laporan |
| 3 | `migration_ar_ap.sql` | Hutang / piutang |
| 4 | `migration_tempo_ar.sql` | Piutang dari penjualan tempo |
| 5 | `migration_fifo_whatsapp.sql` | stock_batches, stockout, setting WA |
| 6 | `migration_telegram.sql` | Setting Telegram |
| 7 | `migration_suppliers.sql` | suppliers + FK produk/batch |
| 8 | `migration_purchases.sql` | purchases, purchase_items |
| 9 | `migration_categories.sql` | product_categories |
| 10 | `migration_auto_stock.sql` | Trigger stok + stock_movements |
| 11 | `migration_batch_expiry.sql` | expiry_date batch (FEFO) |
| 12 | `migration_supplier_indexes.sql` | Index + view ledger (opsional) |
| 13 | **`migration_rls_full.sql`** | **Semua policy RLS** |

Jika error “already exists”, lanjut file berikutnya.

---

## Role & Hak Akses

| Fitur | Admin | Kasir |
|-------|-------|-------|
| POS / cetak struk | ✅ | ✅ |
| Produk, kategori, user | ✅ | ❌ |
| Supplier, pembelian | ✅ | Baca supplier |
| Warehouse, batch ED | ✅ | ✅ |
| Laporan keuangan | ✅ | Terbatas / sesuai RLS |
| Pengaturan PPN, printer, notifikasi | ✅ | ❌ |

---

## Modul Detail

### PPN
- Admin: **Pengaturan** → tarif & mode (exclusive / inclusive)
- Disimpan per transaksi: `subtotal`, `tax_rate`, `tax_amount`, `total`

### FIFO / FEFO
- Batch: `qty_remaining`, `unit_cost`, `received_at`, `expiry_date`, `supplier_id`
- Jual: ED terdekat dulu, lalu tanggal masuk tertua
- Batch expired hanya jika stok non-expired habis

### Stok otomatis
- Insert `sale_items` → trigger kurangi `products.stock` + log movement
- Insert `purchase_items` → trigger tambah stok + log

### Barcode POS
- Hardware scanner (onscan.js) + input manual
- Lookup aktif + stok > 0; debounce double-scan

---

## Printer ESC/POS

1. **Pengaturan** → pilih Web Serial / Bluetooth / browser  
2. Chrome/Edge + **HTTPS** (atau localhost)  
3. Auto-print & kategori dapur (opsional)  

Builder: `lib/escpos.ts` (tanpa library thermal bermasalah di build).

---

## Notifikasi

| Channel | Cara setup |
|---------|------------|
| WhatsApp | Pengaturan → token Meta/Fonnte |
| Telegram | BotFather token + chat_id; webhook: `GET /api/telegram/webhook?secret=...&action=set` |

Forecast → kirim alert restock ke WA / TG / keduanya.

---

## Environment Variables

| Variable | Wajib | Keterangan |
|----------|-------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Ya | URL Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Ya | Anon key |
| `NEXT_PUBLIC_APP_URL` | Produksi | URL publik (webhook) |
| `TELEGRAM_WEBHOOK_SECRET` | Opsional | Proteksi webhook |

Jangan commit `.env.local`.

---

## GitHub & Vercel

```bash
git add .
git commit -m "deskripsi perubahan"
git push origin main
```

1. [vercel.com](https://vercel.com) → Import repo  
2. Env: `NEXT_PUBLIC_SUPABASE_URL` + `ANON_KEY`  
3. Deploy  
4. Supabase Auth → **Site URL** & **Redirect URLs** = domain Vercel  

Branching disarankan: `main` (production) + `feature/...` via Pull Request.

---

## Scripts

```bash
npm run dev          # Development
npm run build        # Production build
npm run start        # Serve hasil build
npm run lint         # ESLint
```

---

## Clear Data / Reset

Hapus data bisnis (jangan hapus `profiles` kecuali sadar risikonya):

```sql
TRUNCATE TABLE public.sale_items, public.sales,
  public.purchase_items, public.purchases,
  public.stock_batches, public.stock_movements, public.stockout_events,
  public.expenses, public.receivables, public.payables,
  public.products, public.product_categories, public.suppliers
RESTART IDENTITY CASCADE;
```

Setelah clear: **hapus cookie browser** lalu login lagi.  
Jika `profiles` hilang → insert ulang role admin (lihat step C.4).

Redirect loop (`ERR_TOO_MANY_REDIRECTS`) = sesi Auth ada tapi `profiles` kosong.

---

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Build: `TextEncoder("latin1")` | Pakai encode single-byte di `escpos.ts` |
| Build: `Supplier` / `Product` type | Pastikan `types/database.ts` lengkap |
| Dropdown Batch kosong | Deploy `BatchesClient` terbaru; cek Network `products` |
| Stok tidak turun | Jalankan `migration_auto_stock.sql` |
| RLS / data kosong | Jalankan `migration_rls_full.sql`; cek `is_admin()` + profiles |
| Favicon 404 | Abaikan atau tambah `app/icon.png` |
| WA/TG gagal | Cek token & allow-list Meta |

---

## Lisensi

Private / sesuai pemilik repositori.

---

**Kasir POS** — kasir, stok, supplier, batch ED, keuangan, dan notifikasi dalam satu aplikasi.
