# Security Plan - LAZISNU POS

Tanggal audit: 2026-06-08

## Status Saat Ini

- Supabase sudah menjadi database utama saat koneksi berstatus `connected`.
- Frontend memakai `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` melalui `src/lib/supabase.js`.
- Tidak ada pemakaian service role key di kode frontend `src`.
- Password masih mengikuti MVP custom di `public.users` untuk menjaga kompatibilitas aplikasi stabil.
- Session login disimpan di `sessionStorage` tanpa password.
- `.env` lokal harus ignored dan tidak boleh dicommit.
- RLS pada schema Phase 1 masih disabled untuk tabel utama.

## Tabel Dengan RLS Disabled Pada Schema Saat Ini

File `supabase/schema.sql` masih berisi `disable row level security` untuk:

- `public.users`
- `public.products`
- `public.transactions`
- `public.transaction_items`
- `public.profit_sharing_settings`
- `public.app_settings`
- `public.sync_logs`

## Query Frontend Dengan Anon Key

Semua query Supabase dari frontend memakai anon publishable key. Operasi yang dilakukan:

- `public.users`: read semua user, read by username saat login, insert/update/delete user, cek transaksi user.
- `public.products`: read produk, insert/update/delete produk, update status aktif, update stok, cek transaksi produk.
- `public.transactions`: read semua transaksi, read by id/number, insert/update/upsert transaksi, update `sync_status` dan `synced_at`.
- `public.transaction_items`: read semua item, insert item transaksi, delete/insert ulang item saat migrasi idempotent.
- `public.profit_sharing_settings`: read setting terbaru, insert/update setting global.
- `public.app_settings`: read untuk health check database.
- `public.sync_logs`: insert log migrasi lokal ke Supabase.

## Current Risk

- Karena RLS masih disabled, anon key dapat menjalankan operasi sesuai grants publik tabel jika endpoint Supabase diketahui.
- Role owner/admin saat ini ditegakkan di frontend, bukan di database.
- Password masih tersimpan di `public.users`, belum memakai Supabase Auth atau password hashing server-side.
- RLS penuh tidak aman diterapkan langsung sebelum `auth.uid()` terhubung ke profile user, karena aplikasi saat ini belum login lewat Supabase Auth.

## Perubahan Phase Security A Yang Dilakukan

- Menambahkan helper permission terpusat di `src/lib/permissions.js`.
- Menu dan route sensitif memakai helper permission, bukan cek role tersebar.
- Akses direct dari `last_view`/session ke halaman yang tidak boleh akan dikembalikan ke Overview.
- Operasi write penting sekarang mengecek session valid dan permission sebelum lanjut:
  - tambah/edit/hapus/status user
  - tambah/edit/hapus/import/status produk
  - simpan transaksi
  - update pengaturan laba
  - simpan/reset URL spreadsheet dan sync spreadsheet
  - migrasi data lokal ke database
- Produk stok habis tetap dipaksa nonaktif di mapping dan tidak bisa diaktifkan sebelum stok ditambah.
- `.env` lokal dikeluarkan dari tracking Git dan `.gitignore` diperketat agar env tidak dicommit.

## Recommended Phase

### Phase Security A - Selesai Saat Ini

- Guard frontend dan helper permission terpusat.
- Tidak mengubah flow login custom, transaksi, laporan, import produk, spreadsheet sync, PWA, atau deploy Vercel.
- Cocok untuk hardening awal setelah modul stabil.

### Phase Security B - Berikutnya

- Review draft `docs/supabase-rls-plan.sql`.
- Jangan apply policy RLS sebelum Supabase Auth terhubung ke user profile.
- Siapkan mapping user auth ke profile, misalnya `public.users.auth_user_id uuid unique references auth.users(id)`.

### Phase Security C - Direkomendasikan Untuk Production Penuh

1. Migrasi login ke Supabase Auth email/password atau phone auth.
2. Ubah `public.users` menjadi profile table tanpa kolom password.
3. Gunakan `auth.uid()` di RLS policy.
4. Hapus penyimpanan password dari database publik.
5. Pertimbangkan Edge Function/server-side untuk operasi owner yang sangat sensitif jika diperlukan.

## Password Safety MVP

- Password saat ini belum memakai Supabase Auth.
- Fase ini hanya untuk aplikasi internal dan menjaga stabilitas modul Stikernisasi.
- Password tidak disimpan di `currentUser`/session.
- Tahap berikutnya wajib memindahkan autentikasi ke Supabase Auth agar password tidak lagi berada di `public.users`.

## Hal Yang Belum Dilakukan

- RLS belum di-enable di database production.
- Supabase Auth belum digunakan untuk login.
- Password belum di-hash server-side dan belum dihapus dari `public.users`.
- Policy database belum menegakkan role owner/admin karena belum ada `auth.uid()` profile binding.
- Audit grant PostgreSQL detail perlu dilakukan langsung di Supabase SQL Editor sebelum RLS penuh.
