# Supabase Auth Migration Plan - LAZISNU POS

Tanggal: 2026-06-08

## Kondisi Saat Ini

- Supabase sudah menjadi database utama saat database connected.
- Login masih custom memakai tabel `public.users`.
- Password masih tersimpan di `public.users` untuk kompatibilitas MVP.
- Permission helper dan guard action frontend sudah tersedia.
- RLS penuh belum diaktifkan.
- `src/services/auth/authAdapter.js` sudah disiapkan, tetapi mode default tetap `custom_users`.

## Risiko Password Custom

- Password berada di tabel publik aplikasi, bukan di Supabase Auth.
- Proteksi role masih ditegakkan oleh frontend dan belum oleh RLS database.
- Jika RLS dinyalakan sebelum Auth siap, aplikasi bisa gagal membaca/menulis data.
- Custom login tidak menyediakan fitur keamanan Supabase Auth seperti session JWT, refresh token, dan policy `auth.uid()`.

## Target Akhir

- Supabase Auth menjadi login utama.
- `public.users` berubah menjadi profile table yang terhubung ke `auth.users` melalui `auth_user_id`.
- Password tidak lagi disimpan atau dibaca dari `public.users`.
- RLS aktif dan memakai `auth.uid()` untuk role owner/admin.
- Owner/admin tetap memiliki behavior aplikasi yang sama setelah migrasi.

## Langkah Migrasi Bertahap

1. Tambahkan `auth_user_id` ke `public.users` memakai draft `supabase/auth-phase-schema.sql`.
2. Buat akun Supabase Auth untuk semua owner/admin aktif.
3. Hubungkan `auth.users.id` ke `public.users.auth_user_id` untuk tiap profile.
4. Uji mapping profile dengan query select berdasarkan `auth_user_id`.
5. Aktifkan mode uji dengan `VITE_AUTH_MODE=supabase_auth` di environment non-production terlebih dahulu.
6. Ubah flow login utama agar memakai `loginWithSupabaseAuth()` dari auth adapter.
7. Pastikan session restore membaca Supabase Auth session dan profile aktif.
8. Hentikan penggunaan password custom di frontend dan service user.
9. Setelah semua user aktif punya `auth_user_id`, enable RLS dengan policy dari `docs/supabase-rls-plan.sql`.
10. Uji role owner/admin untuk semua flow sebelum deploy production.
11. Setelah stabil, hapus kolom password dari `public.users` lewat migration terpisah.

## Testing Wajib

- Owner login dan session restore.
- Admin login dan session restore.
- Owner kelola user.
- Admin tidak bisa akses Data Pengguna dan Pengaturan Laba.
- Owner kelola produk dan import produk.
- Admin input transaksi.
- Laporan dan struk tetap tampil.
- Spreadsheet sync tetap berjalan.
- User inactive/deleted tidak bisa login atau restore session.
- PWA reload tidak memutus flow secara tidak wajar.

## Rollback Plan

- Jangan hapus kolom `password` sampai Supabase Auth stabil.
- Simpan `VITE_AUTH_MODE=custom_users` sebagai fallback cepat.
- Jika Supabase Auth login gagal, kembalikan env ke `custom_users` dan redeploy.
- Jangan enable RLS sampai semua active users punya `auth_user_id` dan flow Auth lulus testing.
- Jika RLS sudah terlanjur bermasalah, disable RLS sementara hanya untuk rollback darurat, lalu perbaiki policy di staging sebelum apply ulang.
- Backup data Supabase dan export local backup sebelum migration besar.
