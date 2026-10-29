# PRD — Pukico

**Status dokumen:** Rencana produk  
**Status produk:** Closed beta  
**Terakhir diperbarui:** 30 Oktober 2026

## 1. Ringkasan

Pukico membantu pengguna mengirim dan menerima USDC menggunakan Pukico ID. Roadmap berangkat dari masukan beta tester: transfer berbasis username terasa mudah, tetapi pengguna membutuhkan akses yang lebih cepat ke penerima sebelumnya, bukti transaksi yang konsisten, rincian biaya yang jelas, permintaan pembayaran, dan pemberitahuan transfer masuk.

Prioritasnya bukan menambah banyak fitur sekaligus. Fokusnya adalah membuat alur transfer yang sudah ada lebih mudah dipahami dan lebih dapat dipercaya.

## 2. Masalah pengguna

- Penerima yang sering digunakan perlu dicari atau diketik ulang.
- Setelah transfer, pengguna perlu melihat informasi transaksi tanpa menebak statusnya.
- Pengguna perlu memahami biaya layanan dan biaya jaringan sebelum menyetujui transaksi.
- Pengguna membutuhkan cara meminta pembayaran tanpa mengirim dana secara otomatis.
- Pengguna perlu mengetahui transfer masuk hanya ketika data transaksinya telah diverifikasi.

## 3. Tujuan

1. Mengurangi langkah untuk mengirim ke penerima yang pernah digunakan.
2. Membuat bukti transaksi konsisten dan bisa diperiksa.
3. Menjelaskan biaya sebelum pengguna menandatangani transaksi.
4. Menambahkan alur permintaan pembayaran yang tidak memindahkan dana dengan sendirinya.
5. Menampilkan notifikasi berdasarkan peristiwa transaksi yang valid dan tidak berulang.

## 4. Bukan tujuan

- Menyimpan private key pengguna.
- Mengubah Pukico menjadi layanan kustodian.
- Membuat wallet baru untuk mendukung fitur-fitur ini.
- Mengirim pembayaran otomatis ketika permintaan dibuka.
- Menyatakan transaksi berhasil tanpa bukti transaksi yang sesuai.
- Mengganti arsitektur wallet atau kontrak hanya demi menambahkan UI.
- Mengklaim dukungan jaringan atau token yang belum diverifikasi.

## 5. Pengguna dan kebutuhan

### Pengguna yang mengirim secara rutin
Membutuhkan cara cepat memilih penerima yang sudah pernah digunakan dan memeriksa detail transaksi.

### Pengguna yang ingin membagi biaya atau menagih pembayaran
Membutuhkan permintaan pembayaran yang mudah dibagikan dan jelas statusnya.

### Pengguna yang menerima transfer
Membutuhkan informasi dana masuk yang tidak membingungkan antara pending, confirmed, dan failed.

## 6. Urutan prioritas

### P1 — Recent Recipients
**Status:** Sudah ada di dashboard beta; tetap perlu diuji pada setiap perubahan terkait transfer.

Kriteria penerimaan:
- Hanya penerima dari transaksi keluar yang valid dan confirmed yang ditampilkan.
- Penerima duplikat dihilangkan dan daftar diurutkan dari yang terbaru.
- Memilih penerima mengisi Pukico ID, tetapi tidak melewati validasi transfer.
- Input manual tetap tersedia.
- Tidak ada data lintas akun.

### P2 — Transaction Receipts
**Status:** Tampilan receipt sudah ada di dashboard beta; verifikasi sumber status dan nilai tetap penting.

Kriteria penerimaan:
- Menampilkan pihak terkait, nominal, token, jaringan, waktu, status, dan hash jika tersedia.
- Link explorer sesuai dengan jaringan transaksi.
- Status sukses didasarkan pada bukti transaksi yang valid.
- Biaya hanya ditampilkan jika sumber datanya tersedia dan jelas.
- Bukti yang dibagikan tidak membocorkan data sensitif.

### P3 — Clear Fee Breakdown
**Prioritas pengembangan berikutnya dalam roadmap.**

Kriteria penerimaan:
- Menampilkan nominal USDC yang dikirim dan service fee jika benar-benar dikenakan.
- Menjelaskan total potongan USDC sesuai aturan bisnis aktual.
- Menampilkan estimasi network fee dalam aset gas yang benar, misalnya ETH pada jaringan Base yang relevan.
- Memisahkan estimasi gas dari biaya final.
- Memperbarui estimasi ketika nominal, penerima, atau kondisi transaksi berubah.
- Meminta persetujuan pengguna sebelum penandatanganan transaksi.
- Tidak menjumlahkan nominal dari aset berbeda seolah-olah satu mata uang.

### P4 — Request Money
**Status:** Rencana pengembangan.

Kriteria penerimaan:
- Pengguna dapat membuat permintaan dengan ID unik, pembuat, penerima, nominal, waktu, dan status.
- Permintaan dapat dibuka melalui tautan atau QR sesuai akses yang diizinkan.
- Penerima membayar melalui alur Send yang sudah ada.
- Status menjadi paid hanya setelah pembayaran yang sesuai diverifikasi.
- Membuat atau membuka permintaan tidak memindahkan dana.
- Sistem menangani pembayaran ganda dan event yang diproses ulang.

### P5 — Incoming Payment Notifications
**Status:** Rencana pengembangan.

Kriteria penerimaan:
- Transfer masuk diperiksa berdasarkan jaringan, token, nominal, alamat penerima, dan receipt.
- Notifikasi memiliki identitas event yang unik untuk mencegah duplikasi.
- Status pending, confirmed, dan failed dibedakan dengan benar.
- Push notification hanya ditambahkan jika infrastrukturnya siap.
- Notifikasi tidak mengklaim dana masuk sebelum verifikasi.

## 7. Alur utama

### Transfer
1. Pengguna memilih penerima atau memasukkan Pukico ID.
2. Aplikasi memvalidasi identitas dan wallet tujuan.
3. Pengguna memasukkan nominal.
4. Aplikasi menampilkan rincian biaya yang tersedia.
5. Pengguna meninjau dan menyetujui transaksi.
6. Wallet meminta tanda tangan.
7. Status transaksi diperbarui dari sumber yang dapat dipercaya.
8. Pengguna dapat membuka receipt.

### Permintaan pembayaran
1. Pembuat memilih penerima dan nominal.
2. Aplikasi menyimpan permintaan, bukan transaksi blockchain.
3. Pembuat membagikan tautan atau QR.
4. Penerima memeriksa permintaan.
5. Penerima menyetujui pembayaran melalui alur Send.
6. Backend memverifikasi transaksi yang sesuai.
7. Status permintaan diperbarui secara aman.

## 8. Persyaratan lintas fitur

- **Keamanan:** otorisasi server-side dan RLS yang sesuai.
- **Akurasi:** jangan mempercayai status dari UI saja.
- **Idempotensi:** event atau callback yang sama tidak boleh menghasilkan perubahan berulang.
- **Mobile:** alur utama harus nyaman pada layar kecil.
- **Aksesibilitas:** label tindakan dan status harus jelas; jangan mengandalkan warna saja.
- **Kegagalan:** pengguna mendapat pesan yang berguna dan tidak diarahkan mengirim ulang transaksi secara membabi buta.
- **Privasi:** data yang dibagikan dibatasi pada kebutuhan transaksi.

## 9. Metrik evaluasi

Metrik berikut adalah usulan untuk beta, bukan hasil yang sudah dicapai:
- Tingkat penyelesaian transfer.
- Waktu dari membuka Send sampai konfirmasi.
- Persentase pengguna yang menggunakan Recent Recipients.
- Jumlah kegagalan akibat saldo gas tidak cukup.
- Jumlah perbedaan antara status UI dan status transaksi terverifikasi.
- Jumlah permintaan pembayaran yang dibuat, dibayar, kedaluwarsa, atau dibatalkan.
- Jumlah notifikasi duplikat atau tidak valid.

Jangan mengumpulkan data tambahan jika metrik dapat dihitung dari data yang sudah tersedia dan sesuai kebijakan privasi.

## 10. Rilis dan definisi selesai

Satu fitur dianggap siap diuji ketika alur normal, pending, gagal, duplikat, akses yang tidak sah, dan tampilan mobile telah diperiksa. Build yang berhasil saja tidak cukup untuk membuktikan alur blockchain benar.

Rilis dilakukan bertahap. Uji pada testnet terlebih dahulu, dokumentasikan masalah yang tersisa, lalu lakukan peninjauan terpisah sebelum mempertimbangkan jaringan produksi.

## 11. Pertanyaan terbuka

- Aturan service fee yang berlaku dan siapa yang membayarnya.
- Jaringan serta token yang akan didukung saat peluncuran publik.
- Masa berlaku dan aturan pembatalan Request Money.
- Apakah tautan permintaan hanya untuk penerima tertentu atau dapat dibuka publik.
- Kanal resmi untuk laporan privasi dan keamanan.

Pertanyaan tersebut harus diputuskan berdasarkan implementasi dan kebijakan produk, bukan diasumsikan oleh antarmuka.
