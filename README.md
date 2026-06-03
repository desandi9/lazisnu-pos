# LAZISNU Garut POS

Aplikasi POS MVP untuk pengelolaan penjualan program LAZISNU Garut. Aplikasi berjalan sebagai React + Vite app, memakai Supabase sebagai database utama jika dikonfigurasi, tetap memakai localStorage sebagai cache/fallback, dan dapat sinkronisasi transaksi ke Google Sheets melalui Google Apps Script.

## Fitur Utama

- Login Owner dan Petugas/Admin.
- Data produk dengan kategori, ukuran, harga, stok, dan status aktif.
- Input penjualan multi item.
- Petugas otomatis mengikuti user login.
- Pembagian laba LAZISNU, PCNU, Petugas, dan Pengelola.
- Struk print dan download PDF.
- Google Sheets sync multi-tab.
- Dashboard Statistik di Google Sheets.
- Export backup data lokal ke JSON.
- Dark/light mode dan mobile friendly.

## Install

```bash
npm install
```

Jika menjalankan dari root workspace utama, gunakan:

```bash
npm --prefix lazisnu-pos install
```

## Run Local

```bash
npm run dev
```

Lalu buka URL lokal yang ditampilkan Vite, biasanya `http://localhost:5173`.

## Build

```bash
npm run build
```

Output build Vite berada di folder `dist`.

## Preview Build

```bash
npm run preview
```

## Setup Google Apps Script

1. Buka Google Sheets yang akan dipakai sebagai arsip transaksi.
2. Pilih `Extensions` -> `Apps Script`.
3. Paste kode dari `docs/google-apps-script-sync.js`.
4. Deploy sebagai `Web app`.
5. Set `Execute as` ke `Me`.
6. Set `Who has access` ke `Anyone`.
7. Copy `Web App URL`.
8. Isi URL tersebut ke konstanta `DEFAULT_SPREADSHEET_WEB_APP_URL` di `src/App.jsx` sebelum build/deploy.

Panduan detail tersedia di `docs/setup-google-sheets-sync.md`.

## Konfigurasi URL Spreadsheet

Aplikasi mendukung URL Google Apps Script default melalui konstanta `DEFAULT_SPREADSHEET_WEB_APP_URL` di `src/App.jsx`.

- Perangkat baru akan memakai URL default tersebut otomatis.
- Admin tidak perlu mengisi ulang URL di setiap browser/perangkat jika default URL sudah diisi pada build aplikasi.
- Jika ingin memakai spreadsheet lain, URL bisa diubah dari halaman `Spreadsheet`, lalu klik `Simpan URL`.
- Tombol `Reset ke URL Default` menghapus URL custom browser dan kembali memakai endpoint bawaan aplikasi.
- Jika konstanta default dikosongkan dan belum ada URL custom, aplikasi tetap menampilkan pesan `Masukkan URL Google Apps Script terlebih dahulu.`

## Struktur Google Sheets

Apps Script membuat dan memakai 5 tab di spreadsheet yang sama:

- `Dashboard Statistik`
- `Transaksi Detail`
- `Rekap Transaksi`
- `Rekap Laba`
- `Rekap Petugas`

## Supabase Database Phase 1

Phase 1 menambahkan foundation Supabase PostgreSQL dan migrasi data lokal, tetapi belum mengganti seluruh flow localStorage. Aplikasi tetap berjalan tanpa Supabase dan tidak crash jika `.env` belum diisi.

Langkah setup:

1. Buat project baru di Supabase.
2. Buka `SQL Editor`.
3. Jalankan file `supabase/schema.sql`.
4. Buka `Project Settings` -> `API`.
5. Copy `Project URL` dan `anon public key`.
6. Copy `.env.example` menjadi `.env`.
7. Isi:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
8. Jalankan `npm run dev`.
9. Buka halaman `Spreadsheet`.
10. Klik `Cek Koneksi Database`.
11. Login sebagai Owner, lalu klik `Migrasi Data Lokal ke Database`.

Catatan keamanan Phase 1:

- Jangan pernah menaruh service role key di frontend.
- Password pada tabel `users` masih mengikuti MVP lokal untuk kompatibilitas migrasi awal.
- Phase 2 wajib pindah ke Supabase Auth atau hashed password proper, plus RLS policy per role.
- Phase 1 hanya foundation dan migrasi. Read/write utama aplikasi masih localStorage.
- Phase 2 akan mengubah aplikasi agar read/write langsung ke Supabase.

## Supabase Migration Phase 2A-2E

Phase 2A-2E memindahkan data utama aplikasi ke Supabase secara bertahap. Saat database berstatus connected, Supabase menjadi source of truth dan localStorage hanya cache/fallback.

- `public.users` menjadi sumber utama untuk login dan Data Pengguna.
- `public.products` menjadi sumber utama untuk produk dan stok.
- `public.transactions` dan `public.transaction_items` menjadi sumber utama untuk transaksi, laporan, struk, export, dan status sync spreadsheet.
- `public.profit_sharing_settings` menjadi sumber utama untuk Pengaturan Laba.
- localStorage tetap menyimpan cache `users`, `products`, `transactions`, `profitSharingSettings`, URL spreadsheet, theme, dan app settings.
- Jika Supabase connected, data hasil fetch database menggantikan cache lokal. Data lokal-only tidak mengalahkan database.
- Jika Supabase belum dikonfigurasi atau koneksi/database gagal, aplikasi fallback ke localStorage agar tetap bisa dipakai.
- Google Sheets tetap dipakai sebagai arsip/export, bukan database utama aplikasi.
- Session login memakai sessionStorage, sehingga refresh tetap login tetapi close tab/browser menghapus session.
- Supabase Auth belum dipakai. Password masih mengikuti tabel `users` MVP untuk transisi bertahap.

### Migrasi Data Lokal

Tombol `Migrasi Data Lokal ke Database` tersedia di halaman `Spreadsheet` untuk Owner.

- Users di-upsert berdasarkan `username`.
- Products di-upsert berdasarkan `local_id`.
- Transactions di-upsert berdasarkan `transaction_number`.
- Transaction items dibuat ulang per transaksi saat migrasi agar tidak dobel.
- Profit sharing settings mengupdate row global yang sudah ada atau membuat row default jika belum ada.
- Migrasi tidak menghapus data lokal browser.

### Cache dan Fallback

- Saat user login dan database connected, aplikasi menyegarkan cache utama dari Supabase: users, products, transactions, dan profit sharing settings.
- Menu Data Produk, Data Pengguna, Laporan, Spreadsheet, dan Pengaturan Laba juga refresh dari Supabase saat dibuka.
- Operasi write tidak fallback diam-diam ke localStorage jika database connected tetapi operasi Supabase gagal.
- Operasi localStorage hanya dipakai jika Supabase belum dikonfigurasi atau database tidak tersedia.

## Deploy ke Vercel

Opsi paling sederhana:

1. Push project ke GitHub.
2. Buka Vercel dan pilih `Add New Project`.
3. Import repository.
4. Set `Framework Preset` ke `Vite`.
5. Jika repository root adalah folder ini, gunakan konfigurasi default:
   - Install Command: `npm install`
   - Build Command: `npm run build`
   - Output Directory: `dist`
6. Jika deploy dari root workspace yang berisi folder `lazisnu-pos`, set `Root Directory` ke `lazisnu-pos`.
7. Klik `Deploy`.

Tidak ada secret key atau API key yang perlu diisi untuk build aplikasi. URL Google Apps Script Web App adalah endpoint publik untuk sync, bukan credential rahasia.

## Dokumentasi Penggunaan

Panduan operator tersedia di `docs/panduan-penggunaan.md`.

## Catatan MVP

- Dengan Supabase configured dan connected, data utama tersimpan di database Supabase.
- localStorage masih penting sebagai cache/fallback dan backup lokal.
- Gunakan sync Google Sheets dan export backup JSON secara berkala sebagai arsip tambahan.
- Jangan commit file `.env` atau credential Supabase ke repository.
