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
12. Klik `Kirim ke Spreadsheet` untuk mengirim transaksi pending.

## Struktur Sheet

Script akan membuat dan memakai 5 tab di spreadsheet yang sama:

- `Dashboard Statistik`
- `Transaksi Detail`
- `Rekap Transaksi`
- `Rekap Laba`
- `Rekap Petugas`

`Dashboard Statistik` berisi ringkasan otomatis dari data `Transaksi Detail`, `Rekap Transaksi`, `Rekap Laba`, dan `Rekap Petugas`. Dashboard ini menampilkan total keseluruhan, statistik hari ini, statistik bulan ini, top petugas berdasarkan omzet, dan produk terlaris berdasarkan qty.

`Transaksi Detail` berisi satu baris per item produk. Jika satu transaksi berisi tiga item, maka akan ada tiga baris dengan `No. Transaksi` yang sama.

`Rekap Transaksi` berisi satu baris per transaksi, termasuk jumlah item, total qty, total transaksi, dan status sync.

`Rekap Laba` berisi pembagian laba per transaksi.

`Rekap Petugas` otomatis ditulis ulang setiap sync dari data `Rekap Transaksi` dan `Rekap Laba`, supaya tidak dobel.

Catatan:
- Data detail, rekap transaksi, dan rekap laba akan ditambahkan ke sheet yang sama dan meneruskan baris sebelumnya.
- `Dashboard Statistik` akan dibuat otomatis jika belum ada, lalu dibersihkan dan ditulis ulang setiap sync berhasil agar tidak append ke bawah.
- Halaman `Spreadsheet` memakai URL default aplikasi jika belum ada URL custom di browser. Tombol `Reset ke URL Default` menghapus URL custom dan kembali ke endpoint bawaan.
- Transaksi multi item dikirim sebagai beberapa baris di `Transaksi Detail` dengan nomor transaksi yang sama.
- Transaksi yang sudah `synced` tidak akan dikirim ulang.
- Jika sync gagal, data tetap `pending` dan aman untuk dicoba lagi.
- Header sheet otomatis dibuat jika sheet masih kosong.
- Header dan section utama diformat hijau emerald/LAZISNU, teks putih, format rupiah, format tanggal `dd/MM/yyyy HH:mm`, freeze row, border tipis, dan auto resize columns.
