# Design System Pukico

Dokumen ini menetapkan prinsip tampilan dan interaksi untuk menjaga dashboard dan landing page Pukico terasa sebagai satu produk. Detail token visual harus disesuaikan dengan implementasi aktual dan diperbarui saat desain berubah.

## 1. Arah desain

Pukico harus terasa jelas, tenang, dan praktis. Antarmuka finansial tidak perlu ramai untuk terlihat modern. Informasi terpenting adalah siapa penerimanya, berapa jumlahnya, aset dan jaringan apa yang digunakan, berapa biaya yang diketahui, dan tindakan apa yang akan dilakukan.

## 2. Hirarki informasi

Pada layar transfer, urutan prioritas informasi:

1. Penerima dan identitas yang telah di-resolve.
2. Nominal dan token.
3. Jaringan aktif.
4. Rincian biaya dan total yang relevan.
5. Status serta tindakan berikutnya.

Jangan menyembunyikan biaya atau jaringan di balik teks yang sulit ditemukan sebelum konfirmasi.

## 3. Warna dan status

Gunakan warna yang sudah menjadi bagian dari antarmuka Pukico. Warna tidak boleh menjadi satu-satunya cara membedakan status.

- **Confirmed:** label teks yang jelas dan indikator visual positif.
- **Pending:** jelaskan bahwa transaksi masih diproses.
- **Failed:** jelaskan bahwa transaksi gagal dan tindakan aman berikutnya.
- **Warning:** gunakan untuk kondisi seperti saldo gas tidak cukup atau jaringan yang tidak sesuai.
- **Disabled:** tampilkan bahwa tindakan tidak tersedia dan, jika berguna, alasannya.

Jangan menggunakan gaya sukses untuk transaksi yang baru dikirim tetapi belum terverifikasi.

## 4. Tipografi dan angka

- Gunakan gaya teks yang konsisten dengan komponen yang sudah ada.
- Nominal token harus mudah dipindai dan tidak terpotong pada layar kecil.
- Gunakan pemformatan angka yang konsisten dengan bahasa dan konteks pengguna.
- Jangan membulatkan nilai internal untuk perhitungan transaksi.
- Untuk gas, tampilkan satuan yang jelas, misalnya ETH.
- Label estimasi harus terlihat berbeda dari biaya final.

## 5. Tombol dan tindakan

Gunakan label tindakan yang spesifik:
- `Send` untuk memulai transfer.
- `Request` untuk membuat permintaan pembayaran.
- `Review transfer` atau padanan bahasa Indonesia untuk memeriksa rincian.
- `Confirm` hanya pada tindakan yang benar-benar memerlukan persetujuan.
- `Cancel` untuk membatalkan tindakan yang belum dijalankan.

Jangan membuat tombol Request terlihat seolah-olah langsung menagih atau menarik dana dari penerima.

Tindakan utama harus mudah ditemukan. Tindakan sekunder tidak boleh secara visual bersaing dengan konfirmasi transaksi.

## 6. Quick Actions

Quick Actions adalah tempat yang sesuai untuk tindakan yang sering dipakai, seperti Send dan Request, selama sesuai dengan susunan dashboard yang aktif.

Aturan:
- Gunakan ikon yang mudah dikenali dan label teks.
- Pertahankan ukuran area sentuh yang nyaman pada perangkat mobile.
- Hindari menambahkan terlalu banyak tindakan sekaligus.
- Pastikan tindakan membuka alur yang benar dan tidak memulai transaksi secara otomatis.

## 7. Formulir

Formulir harus:
- Memiliki label yang terlihat, bukan hanya placeholder.
- Memvalidasi input dan menjelaskan masalah dekat dengan field terkait.
- Menjaga input pengguna ketika terjadi error yang bisa dipulihkan.
- Mencegah submit berulang saat permintaan sedang diproses.
- Menampilkan loading dan hasil operasi dengan jelas.
- Tidak mengandalkan floating-point arithmetic untuk nominal token.

Untuk Request Money, tampilkan penerima, nominal, jaringan, catatan opsional, dan ringkasan sebelum permintaan dibuat.

## 8. Fee breakdown

Sebelum transaksi ditandatangani, tampilkan komponen biaya yang diketahui:

- Nominal USDC yang akan dikirim.
- Service fee jika memang dikenakan.
- Total potongan USDC berdasarkan aturan aktual.
- Estimasi network fee dan aset gas yang digunakan.

Jangan mencampur jumlah USDC dan ETH menjadi satu total tanpa konversi yang valid. Jika estimasi belum tersedia, katakan demikian; jangan tampilkan angka lama seolah-olah masih berlaku.

## 9. Transaction receipt

Receipt harus mudah dibaca dan aman dibagikan. Tampilkan data yang tersedia dan relevan, seperti pihak terkait, nominal, jaringan, waktu, status, biaya yang diketahui, hash, dan link explorer.

Jangan menampilkan data yang tidak diketahui sebagai nilai pasti. Link explorer harus sesuai jaringan. Data yang dibagikan tidak boleh mengandung token autentikasi atau informasi rahasia.

## 10. Empty, loading, dan error states

Setiap fitur data harus mempertimbangkan:
- **Loading:** data sedang dimuat.
- **Empty:** belum ada data; jelaskan apa yang dapat dilakukan pengguna.
- **Error:** data tidak dapat dimuat; sediakan cara mencoba kembali jika aman.
- **Pending:** operasi belum selesai.
- **Success:** operasi berhasil sesuai sumber kebenaran yang tepat.

Jangan mengganti error dengan data contoh tanpa penanda yang jelas.

## 11. Mobile dan aksesibilitas

- Uji layout pada layar kecil.
- Hindari overflow pada alamat, hash, nominal, dan Pukico ID.
- Jangan mengandalkan warna saja untuk status.
- Beri label yang dapat dipahami pada kontrol ikon.
- Jaga kontras teks dan latar.
- Pastikan sheet atau modal bisa ditutup dan dinavigasi dengan jelas.
- Jangan menaruh informasi penting hanya pada hover.

## 12. Konsistensi komponen

Sebelum membuat komponen baru, cari komponen yang sudah ada untuk tombol, bottom sheet, toast, status, dan detail transaksi. Perluas komponen yang sesuai daripada membuat pola baru tanpa alasan.

Dokumen ini sengaja tidak menetapkan nilai warna, ukuran, atau radius numerik yang belum diverifikasi dari kode desain. Jika token desain formal ditambahkan, dokumentasikan nilai yang benar-benar digunakan di kode.
