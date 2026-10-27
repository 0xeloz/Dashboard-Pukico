# Pukico: Product Requirements Document (PRD)

Versi: 0.1 (closed beta) · Status: draf untuk disetujui tim · Pemilik: Founder / Co-founder

Dokumen ini ditulis dari kode yang ada (landing, dashboard, edge function) dan keputusan selama persiapan closed beta. Hal yang belum pasti ditandai **[Perlu diputuskan]**.

## 1. Ringkasan

Pukico adalah aplikasi untuk mengirim dan menerima crypto memakai **username (Pukico ID)**, bukan alamat `0x` yang panjang. Dompet dibuat otomatis lewat Privy (embedded wallet) saat pengguna masuk dengan email. Closed beta berjalan di **testnet Base Sepolia**, tanpa uang sungguhan.

Janji produk: *"Send crypto to a username. Not a 0x address."*

## 2. Masalah dan peluang

- Alamat `0x...` sulit diingat, mudah salah salin, dan menakutkan bagi pemula.
- Aplikasi dompet biasa meminta pengguna memahami seed phrase, gas, dan jaringan sebelum bisa mengirim satu transaksi.
- Pengguna sudah terbiasa mengirim uang ke nama atau ID di aplikasi fintech. Crypto belum punya pengalaman yang setara.

## 3. Target pengguna (beta)

| Persona | Kebutuhan | Catatan |
|---|---|---|
| Tester komunitas Web3 (Indonesia dan global) | Mencoba, melaporkan bug, memberi masukan | Sumber: waitlist dan Discord |
| Teman yang saling kirim | Kirim ke ID teman, lihat riwayat | Fitur Friends |
| Pemula crypto | Mulai tanpa mengelola seed phrase | Embedded wallet + passkey |

## 4. Tujuan dan non-tujuan

**Tujuan beta 1**
1. Membuktikan alur inti: masuk, klaim Pukico ID, kirim, terima, riwayat, bekerja tanpa pendampingan.
2. Mengukur aktivasi dan penggunaan berulang, bukan hanya jumlah pendaftar.
3. Menguji keamanan dasar: gerbang akses, pencabutan, passkey.
4. Membangun kelompok tester awal yang aktif.

**Non-tujuan (saat ini)**
- Uang sungguhan atau mainnet.
- On/off-ramp fiat, kartu, atau swap.
- Aplikasi native (saat ini web mobile-first).
- Program referral publik.

## 5. Ruang lingkup fitur

### Sudah ada (dari kode)

| ID | Fitur | Keterangan |
|---|---|---|
| F1 | Waitlist | Email + Pukico ID pilihan; reservasi ID 14 hari setelah diundang; honeypot anti-bot |
| F2 | Gerbang akses beta | Kode `PUKI-XXXXX-XXXXX`, sekali pakai, kedaluwarsa, bisa dicabut, batas percobaan |
| F3 | Login email | Privy; dompet embedded otomatis dibuat |
| F4 | Klaim Pukico ID | Satu akun satu ID; ID yang dipesan di waitlist dijaga |
| F5 | Kirim | USDC dan ETH ke Pukico ID; tinjauan di aplikasi; verifikasi passkey bila aktif |
| F6 | Terima | Tampilkan alamat dan QR |
| F7 | Riwayat dan notifikasi | Status pending, confirmed, failed; sinkron otomatis |
| F8 | Friends | Cari, tambah, hapus teman; kirim cepat |
| F9 | Get test USDC | Faucet untuk testnet |
| F10 | Passkey / MFA | Pendaftaran di Settings; Authenticator sebagai cadangan |
| F11 | Dua bahasa | English dan Indonesia |
| F12 | Panel pengembang (admin) | `DevView` untuk role admin |

### Direncanakan

| ID | Fitur | Prioritas |
|---|---|---|
| P1 | Pengiriman kode otomatis (`send-invite`) | Tinggi setelah wave 1 |
| P2 | Persetujuan lewat email waitlist (tanpa kode) | Sedang |
| P3 | Panel admin undangan di DevView | Sedang |
| P4 | Status passkey di Settings (aktif/kelola) | Tinggi |
| P5 | Tab Discover | Rendah (placeholder "Coming soon") |
| P6 | Referral, terpisah dari kontrol akses | Setelah beta 1 |
| P7 | Pagar transaksi: intent server, batas, saklar darurat, log audit (dompet tetap non-kustodial) | Tinggi (sedang dibangun) |
| P8 | Fee ke treasury (server menentukan jumlah dan alamat; mati selama beta; mekanisme atomik sebelum mainnet) | Rendah untuk beta |
| P9 | Toast untuk umpan balik singkat (salin, galat, sukses) | Tinggi |

## 6. Alur utama

1. **Waitlist:** pengguna mengisi email (dan ID pilihan) di pukico.xyz.
2. **Undangan:** admin membuat kode untuk email itu dan mengirimnya dari `hello@pukico.xyz`.
3. **Masuk:** pengguna login di app.pukico.xyz dengan email waitlist yang sama.
4. **Kode:** memasukkan kode akses; tanpa kode hanya melihat layar closed beta.
5. **Klaim ID:** memilih atau mengambil ID yang dipesan.
6. **Ambil token testnet:** USDC dari tombol Get test USDC, ETH dari faucet Base Sepolia.
7. **Kirim:** pilih penerima, jumlah, tinjau, setujui (passkey bila aktif), lihat status.
8. **Komunitas:** memposting Pukico ID di #beta-start untuk mendapat role Tester.

## 7. Persyaratan fungsional (ringkas)

- **RF-1** Pengguna tanpa akses tidak boleh klaim ID, mengirim, atau menerima pencatatan di Pukico.
- **RF-2** Kode hanya berlaku sekali, kedaluwarsa, dan bisa dicabut; 5 percobaan gagal per 15 menit mengunci sementara.
- **RF-3** Transaksi yang tercatat harus sesuai on-chain: pengirim, penerima, aset, jumlah.
- **RF-4** Pengguna melihat status transaksi (pending, confirmed, failed, timeout) tanpa menyegarkan manual.
- **RF-5** Pengguna yang aksesnya dicabut melihat pesan jelas dan tombol Send nonaktif.
- **RF-6** Semua teks tersedia di English dan Indonesia.
- **RF-7** Setiap pengiriman menampilkan penerima (Pukico ID), jumlah, aset, jaringan, dan biaya sebelum disetujui.

## 8. Persyaratan non-fungsional

- Mobile-first; layar kecil (sekitar 380 px) adalah target utama.
- Kecepatan: aksi umum terasa instan; konfirmasi on-chain diperbarui tiap beberapa detik, batas tunggu 90 detik sebelum status "masih dicek".
- Ketersediaan: tidak ada target resmi untuk beta **[Perlu diputuskan]**.
- Keamanan: lihat `security.md`.
- Aksesibilitas: fokus terlihat (outline 2 px biru), kontras teks memadai.

## 9. Metrik keberhasilan

Sumber data: view `beta_funnel` di Supabase.

| Metrik | Target wave 1 |
|---|---|
| Klaim ID dalam 48 jam setelah undangan | ≥ 70% |
| Transaksi confirmed pertama | ≥ 50% |
| Transaksi di 2 hari berbeda dalam 7 hari | ≥ 30% |
| Laporan bug/feedback yang bisa ditindaklanjuti | ≥ 10 |
| Transaksi dengan status salah (pending selamanya, salah penerima) | 0 |

## 10. Rencana rilis beta

| Wave | Peserta | Syarat lanjut |
|---|---|---|
| 1a | 3 tester | Alur lancar 48 jam, 2 dari 3 klaim ID dan kirim transaksi, tidak ada status salah |
| 1b | +7 tester | Target wave 1 tercapai, passkey sebagai misi opsional |
| 2 | +20 tester | Tidak ada isu keamanan terbuka; RPC sendiri (bukan RPC publik) |
| Evaluasi | hari ke-26 | Putuskan referral, persetujuan email, atau perluasan |

## 11. Peran dan tanggung jawab

| Peran | Tanggung jawab |
|---|---|
| Founder | Keputusan produk, penerbitan kode, pantau funnel |
| Co-founder | Arsitektur, keamanan, rencana wave, prompt pengembangan |
| Community lead | Discord, memberi role Tester berdasarkan roster, merangkum feedback |

## 12. Risiko utama

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Kode bocor atau dipakai orang lain | Akses tak sah | Satu kode per orang, cocokkan email dengan label, cabut cepat |
| Tester macet di token testnet | Aktivasi rendah | Panduan #beta-start, tombol faucet |
| RPC publik membatasi permintaan | Transaksi lambat | RPC sendiri sebelum wave 2 |
| Privy masih mode development | Batas pengguna atau fitur | Cek batas; rencanakan upgrade |
| Pencabutan tidak membekukan dana (non-kustodial) | Pengguna tetap memegang dananya | Dijelaskan di Syarat Layanan; pagar P7 untuk aplikasi resmi |

## 13. Pertanyaan terbuka

1. **[Perlu diputuskan]** Apakah passkey wajib sebelum mainnet? Rekomendasi: wajib.
2. **[Perlu diputuskan]** Persetujuan lewat email atau tetap kode untuk wave 2?
3. **[Perlu diputuskan]** Kapan upgrade Privy ke production dan apa dampak biayanya?
4. **[Perlu diputuskan]** Kebijakan data: berapa lama email waitlist dan data tester disimpan?
5. **[Perlu diputuskan]** Syarat hukum dan kepatuhan sebelum mainnet (belum dikaji di dokumen ini).
6. **[Perlu diputuskan]** Model fee: persen, nominal tetap, atau gratis di awal? Dibebankan di atas jumlah (penerima menerima penuh) atau dipotong dari jumlah?
7. **[Perlu diputuskan]** Siapa pemegang kunci treasury dan apakah memakai multisig?
