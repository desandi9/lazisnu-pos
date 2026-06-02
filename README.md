# LAZISNU Garut POS

Aplikasi POS MVP untuk pengelolaan penjualan program LAZISNU Garut. Aplikasi berjalan sebagai React + Vite app, menyimpan data utama di local storage browser, dan dapat sinkronisasi transaksi ke Google Sheets melalui Google Apps Script.

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

- Data utama tersimpan di local storage browser/perangkat.
- Gunakan sync Google Sheets dan export backup JSON secara berkala.
- Jangan hapus data browser jika belum melakukan backup atau sync.
