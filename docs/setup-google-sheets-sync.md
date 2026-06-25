# Setup Google Sheets Sync

1. Buka Google Sheets yang akan menjadi arsip transaksi.
2. Pilih `Extensions` -> `Apps Script`.
3. Paste kode dari `docs/google-apps-script-sync.js`.
4. Jika perlu, isi `SPREADSHEET_ID`. Jika script dibuat dari Google Sheets tujuan, boleh dikosongkan.
5. Klik `Deploy` -> `New deployment`.
6. Pilih type `Web app`.
7. Set `Execute as` ke `Me`.
8. Set `Who has access` ke `Anyone`.
9. Klik `Deploy`, lalu copy `Web App URL`.
10. Isi URL tersebut ke konstanta `DEFAULT_SPREADSHEET_WEB_APP_URL` di `src/App.jsx` sebelum build/deploy agar semua perangkat memakai endpoint default.
11. Jika perlu mengganti endpoint hanya untuk browser tertentu, paste URL lain di halaman `Spreadsheet`, lalu klik `Simpan URL`.
12. Klik `Refresh Spreadsheet` untuk merefresh penuh dashboard dan semua rekap Stikernisasi.

## Struktur Sheet

Script akan membuat dan merefresh penuh 8 tab Stikernisasi di spreadsheet yang sama:

- `Dashboard Statistik`
- `Rekap Transaksi`
- `Transaksi Detail`
- `Rekap Laba`
- `Rekap Petugas`
- `Piutang`
- `Uang di Luar`
- `Stok Barang`

`Dashboard Statistik` berisi ringkasan otomatis dari data terbaru: transaksi sukses, omzet, qty terjual, piutang, uang di luar, top petugas, produk terlaris, ringkasan stok, dan ringkasan piutang.

`Transaksi Detail` berisi satu baris per item produk untuk transaksi `paid` saja.

`Rekap Transaksi` berisi satu baris per transaksi sukses `paid` saja.

`Rekap Laba` dan `Rekap Petugas` hanya menghitung transaksi `paid`.

`Piutang` dan `Uang di Luar` hanya berisi transaksi `unpaid` dan `partial`.

`Stok Barang` berisi kolom Masuk, Terjual, Piutang, Hilang, dan Sisa.

Catatan:
- Semua sheet Stikernisasi di-clear lalu ditulis ulang setiap sync agar data lama tidak menumpuk.
- Halaman `Spreadsheet` memakai URL default aplikasi jika belum ada URL custom di browser. Tombol `Reset ke URL Default` menghapus URL custom dan kembali ke endpoint bawaan.
- Transaksi multi item dikirim sebagai beberapa baris di `Transaksi Detail` dengan nomor transaksi yang sama.
- Transaksi yang sudah `synced` tetap ikut snapshot agar dashboard selalu akurat, tetapi hanya transaksi pending yang status sync-nya diperbarui.
- Jika sync gagal, data tetap `pending` dan aman untuk dicoba lagi.
- Header sheet otomatis dibuat jika sheet masih kosong.
- Header dan section utama diformat hijau emerald/LAZISNU, teks putih, format rupiah, format tanggal `dd/MM/yyyy HH:mm`, freeze row, border tipis, dan auto resize columns.
