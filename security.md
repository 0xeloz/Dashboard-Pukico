# Keamanan Pukico

Keamanan transaksi adalah bagian dari produk, bukan pekerjaan yang bisa ditunda sampai setelah fitur selesai. Dokumen ini menjelaskan prinsip yang harus diikuti dan tidak menyatakan bahwa seluruh sistem telah diaudit secara independen.

## 1. Prinsip utama

- Pengguna menyetujui transaksi melalui wallet yang terhubung.
- Private key tidak boleh diminta atau disimpan oleh aplikasi.
- Status transaksi harus didukung bukti yang sesuai dari jaringan.
- Setiap permintaan backend harus mengautentikasi pemanggil dan memeriksa hak akses.
- Data pengguna tidak boleh dapat dibaca atau diubah oleh akun yang tidak berhak.
- Kegagalan harus ditangani secara eksplisit, bukan ditutupi dengan data simulasi.

## 2. Autentikasi bukan otorisasi

Pengguna yang sudah login belum tentu berhak membaca atau mengubah setiap baris data. Backend dan kebijakan Row Level Security (RLS) harus membatasi akses berdasarkan pemilik data dan aturan bisnis.

Jangan menggunakan metadata profil yang bisa diubah pengguna sebagai satu-satunya dasar keputusan akses. Untuk operasi sensitif, validasi identitas dan izin di sisi server.

## 3. Perlindungan secret

- Jangan memasukkan private key, service-role key, token rahasia, atau kredensial ke kode frontend.
- Jangan menaruh secret dalam file dokumentasi, issue publik, screenshot, atau log.
- Gunakan pengelolaan secret pada lingkungan server.
- Jika secret terlanjur dipublikasikan, cabut atau rotasi sesuai prosedur dan periksa penggunaan yang tidak sah.

Kunci publik yang memang dirancang untuk frontend berbeda dari secret server. Tetap pastikan konfigurasi sesuai panduan penyedia layanan.

## 4. Verifikasi transaksi

Jangan menyatakan transaksi sukses hanya karena:
- Pengguna menekan tombol.
- Wallet mengembalikan transaction hash.
- Transaksi telah dikirim ke jaringan.
- UI menerima respons sukses dari permintaan awal.

Sebelum status confirmed ditampilkan, periksa jaringan yang benar dan receipt yang sukses. Untuk pembayaran Request Money, cocokkan token, nominal, penerima, jaringan, dan referensi permintaan yang relevan.

Pending, confirmed, dan failed harus memiliki arti yang konsisten. Jika status belum diketahui, tampilkan bahwa status masih diproses atau belum dapat diverifikasi.

## 5. Rincian biaya

Service fee dan network fee adalah hal yang berbeda. Tampilkan hanya biaya layanan yang benar-benar dikenakan. Estimasi gas harus diberi label estimasi, menyebut aset gas yang benar, dan tidak disajikan sebagai biaya final.

Jangan menjumlahkan USDC dan ETH menjadi satu angka tanpa konversi yang jelas dan sumber kurs yang dapat dipertanggungjawabkan.

## 6. Request Money

Permintaan pembayaran tidak boleh memindahkan dana secara otomatis.

- Hanya pembuat yang sah yang boleh membuat permintaan atas namanya sendiri.
- Pembatalan dan perubahan status harus dibatasi sesuai aturan produk.
- Tautan yang dapat dibagikan tidak otomatis berarti semua data permintaan boleh dibaca publik.
- Jangan percaya nominal atau identitas yang dikirim frontend tanpa memeriksa data server.
- Status paid hanya boleh ditetapkan setelah pembayaran yang sesuai diverifikasi.
- Cegah pemrosesan event berulang dan pembayaran ganda melalui mekanisme server-side, constraint, atau idempotensi yang sesuai.

## 7. RLS dan akses database

Untuk tabel yang dapat diakses melalui API, aktifkan RLS dan tulis kebijakan berdasarkan model kepemilikan yang sebenarnya. Uji operasi baca, tambah, ubah, dan hapus secara terpisah. Jangan menganggap pemeriksaan role login saja sudah cukup.

Perubahan pada view, fungsi database, atau operasi dengan hak istimewa perlu ditinjau khusus karena dapat mengubah perilaku kontrol akses.

## 8. Log dan privasi

Log sebaiknya membantu diagnosis tanpa menyimpan rahasia atau data pribadi yang tidak diperlukan. Hindari mencatat token autentikasi, private key, isi sensitif, atau seluruh payload pengguna tanpa alasan.

Data yang ditampilkan pada receipt atau dibagikan melalui tautan harus dibatasi pada informasi yang diperlukan untuk memahami transaksi.

## 9. Testnet dan produksi

Testnet digunakan untuk menguji perilaku aplikasi. Token testnet bukan aset bernilai uang nyata. Sebelum rilis produksi, verifikasi jaringan, alamat kontrak token, konfigurasi explorer, mekanisme biaya, dan proses pemulihan kegagalan.

Jangan mempromosikan testnet sebagai bukti bahwa sistem produksi telah aman.

## 10. Checklist sebelum rilis

- [ ] Tidak ada secret dalam bundle frontend atau repositori publik.
- [ ] RLS diuji dengan lebih dari satu akun.
- [ ] API memverifikasi identitas dan otorisasi server-side.
- [ ] Status transaksi bersumber dari verifikasi yang benar.
- [ ] Transaksi pending dan failed tidak dinyatakan sukses.
- [ ] Permintaan pembayaran tidak memicu transfer otomatis.
- [ ] Event duplikat tidak menghasilkan perubahan atau notifikasi ganda.
- [ ] Error tidak menampilkan data palsu sebagai data nyata.
- [ ] Build dan tes yang relevan berhasil.
- [ ] Risiko yang belum terselesaikan dicatat sebelum rilis.

## 11. Pelaporan kerentanan

Jangan memublikasikan kredensial atau langkah eksploitasi pada issue publik. Gunakan kanal kontak keamanan resmi yang dipublikasikan Pukico. Jika kanal tersebut belum tersedia, siapkan sebelum membuka program pelaporan publik.

Dokumen ini adalah panduan keamanan produk, bukan hasil audit keamanan independen.
