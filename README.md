# Pukico

Pukico adalah aplikasi untuk mengirim dan menerima USDC menggunakan Pukico ID. Tujuannya sederhana: membuat transfer antar pengguna lebih mudah dipahami, tanpa mengaburkan apa yang terjadi pada transaksi.

> **Status produk:** Pukico sedang berada dalam tahap closed beta. Fitur, jaringan yang didukung, dan alur produk dapat berubah selama pengujian.

## Yang sedang dibangun

Roadmap produk saat ini berfokus pada lima kebutuhan:

1. **Recent Recipients** — memilih kembali penerima yang pernah ditransfer.
2. **Transaction Receipts** — memeriksa detail transaksi dan membagikan bukti transaksi.
3. **Clear Fee Breakdown** — memahami biaya sebelum menyetujui transfer.
4. **Request Money** — meminta pembayaran melalui Pukico ID atau tautan/QR.
5. **Incoming Payment Notifications** — menerima pemberitahuan atas transfer masuk yang telah diverifikasi.

Recent Recipients dan tampilan Transaction Receipt sudah ada di dashboard beta. Status implementasi dan verifikasi fitur lain dapat berubah; lihat catatan rilis atau dokumentasi produk terbaru sebelum mengandalkannya.

## Prinsip produk

- **Jelas sebelum konfirmasi.** Nominal, biaya, jaringan, dan tindakan yang akan dilakukan harus mudah dipahami.
- **Persetujuan tetap di tangan pengguna.** Membuat permintaan pembayaran tidak memindahkan dana. Pengiriman tetap membutuhkan persetujuan dan tanda tangan pengguna.
- **Status harus punya dasar.** UI tidak boleh menyatakan transaksi berhasil hanya karena tombol ditekan atau transaction hash sudah dibuat.
- **Privasi sebagai standar.** Pengguna hanya boleh mengakses data yang memang menjadi haknya.
- **Perubahan kecil, pengujian nyata.** Fitur baru sebaiknya mengikuti arsitektur yang ada dan diuji sebelum dirilis.

## Dokumentasi

- [PRD](PRD.md) — kebutuhan produk, ruang lingkup, alur, dan kriteria penerimaan.
- [Arsitektur](arsitektur.md) — gambaran komponen dan tanggung jawabnya.
- [Keamanan](security.md) — prinsip keamanan dan hal yang perlu diverifikasi.
- [Design system](designsystem.md) — pedoman antarmuka dan pola interaksi.

## Teknologi

Dashboard yang diperiksa menggunakan React, TypeScript, dan Vite. Integrasi wallet menggunakan Privy dan viem. Supabase digunakan untuk layanan backend dan fungsi server. Detail implementasi dapat berubah; dokumentasi ini menjelaskan prinsip dan batas tanggung jawab, bukan kontrak API yang dijamin stabil.

## Lingkungan dan jaringan

Jaringan testnet seperti Base Sepolia digunakan untuk pengujian. Aset di testnet tidak memiliki nilai uang nyata. Periksa jaringan yang dipilih di aplikasi sebelum melakukan tindakan apa pun.

## Pelaporan masalah keamanan

Jangan memublikasikan kredensial, token, private key, data akun, atau detail yang dapat dipakai untuk menyerang pengguna. Untuk laporan keamanan, hubungi kanal kontak resmi Pukico yang tercantum pada situs atau repositori proyek. Jangan menganggap isu sebagai laporan privat jika dikirim melalui issue publik.

## Catatan

Dokumentasi ini bersifat informatif. Dokumen ini bukan janji ketersediaan layanan, nasihat keuangan, atau jaminan bahwa setiap fitur sudah tersedia di semua lingkungan.
