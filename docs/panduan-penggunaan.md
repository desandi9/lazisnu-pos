# Panduan Penggunaan LAZISNU Garut POS

## Login

- Buka aplikasi, lalu klik `Masuk Aplikasi`.
- Default role login adalah `Petugas/Admin`.
- Login petugas/admin memakai username petugas dan password yang sudah dibuat owner.
- Owner dapat memilih tab `Owner`, lalu login dengan akun owner.

## Install Aplikasi di HP/Desktop

Android Chrome:

1. Buka `https://lazisnu-pos.vercel.app/`.
2. Tap menu titik tiga.
3. Pilih `Tambahkan ke layar utama` atau `Install app`.
4. Buka dari icon `LAZISNU POS`.

iPhone Safari:

1. Buka link aplikasi di Safari.
2. Tap tombol `Share`.
3. Pilih `Add to Home Screen` atau `Tambahkan ke Layar Utama`.
4. Buka dari icon `LAZISNU POS`.

Desktop Chrome/Edge:

1. Buka link aplikasi.
2. Klik icon install di address bar.
3. Pilih install `LAZISNU POS`.

## Tambah Produk

- Login sebagai `Owner`.
- Buka menu `Data Produk`.
- Klik `Tambah Produk`.
- Isi nama produk, kategori, ukuran, harga, stok, dan batas stok kritis.
- Klik `Simpan Data`.

## Input Penjualan Multi Item

- Login sebagai `Petugas/Admin` atau `Owner`.
- Buka menu `Input Penjualan`.
- Petugas penjual otomatis mengikuti user yang sedang login.
- Pilih produk, isi qty, lalu klik `Tambah ke Keranjang`.
- Ulangi langkah tersebut jika transaksi berisi lebih dari satu item.
- Isi nama pembeli jika perlu, pilih metode pembayaran, lalu klik `Simpan Transaksi`.

## Struk dan PDF

- Setelah transaksi tersimpan, aplikasi menampilkan struk otomatis.
- Klik `Print` untuk mencetak struk.
- Klik `Download PDF` untuk menyimpan struk sebagai PDF.
- Struk transaksi lama dapat dibuka dari menu `Laporan & Laba`, lalu klik `Lihat Struk`.

## Update Spreadsheet

- Buka menu `Spreadsheet`.
- Aplikasi sudah mendukung URL Spreadsheet default, jadi admin tidak perlu mengisi ulang URL di setiap perangkat jika default URL sudah disiapkan pada build aplikasi.
- Jika ingin memakai spreadsheet lain, isi `Google Apps Script Web App URL`, lalu klik `Simpan URL`.
- Klik `Reset ke URL Default` untuk menghapus URL custom browser dan kembali memakai endpoint bawaan aplikasi.
- Klik `Kirim ke Spreadsheet` untuk mengirim transaksi pending.
- Jika tidak ada transaksi baru, aplikasi akan memberi pesan bahwa tidak ada data yang perlu disinkronkan.

## Membaca Sheet Google Sheets

- `Dashboard Statistik`: ringkasan total, statistik hari ini, statistik bulan ini, top petugas, dan produk terlaris.
- `Transaksi Detail`: satu baris per item produk. Satu transaksi multi item bisa muncul dalam beberapa baris.
- `Rekap Transaksi`: satu baris per transaksi berisi total item, total qty, omzet, metode, status sync, dan waktu sync.
- `Rekap Laba`: satu baris per transaksi berisi pembagian LAZISNU, PCNU, Petugas, dan Pengelola.
- `Rekap Petugas`: ringkasan per petugas yang ditulis ulang setiap sync agar tidak double count.

## Pembagian Laba

- Login sebagai `Owner`.
- Buka menu `Pengaturan Laba`.
- Atur persentase LAZISNU, PCNU, Petugas, dan Pengelola.
- Total persentase harus 100%.
- Pengaturan baru berlaku untuk transaksi berikutnya.

## Kelola Petugas

- Login sebagai `Owner`.
- Buka menu `Pengguna`.
- Tambah atau edit data owner/admin.
- User nonaktif tidak bisa login.
- Sistem menjaga minimal satu owner aktif.

## Backup Data Lokal

- Buka menu `Spreadsheet`.
- Klik `Export Backup Data`.
- Aplikasi akan mengunduh file JSON berisi users, products, transactions, profitSharingSettings, lastSync, dan spreadsheetUrl.

## Catatan MVP

- Data utama MVP masih tersimpan di local storage browser/perangkat.
- Gunakan fitur sync Spreadsheet dan export backup secara berkala.
- Jika browser cache/local data dihapus, data lokal aplikasi juga bisa hilang.
