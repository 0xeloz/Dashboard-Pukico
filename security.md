# Pukico: Keamanan

Versi: 0.1 · Cakupan: closed beta di testnet. Dokumen ini membedakan **yang sudah diverifikasi**, **yang dibaca dari kode**, dan **yang masih celah**. Ini bukan audit independen.

## 1. Model ancaman

**Aset yang dilindungi**
1. Dompet dan dana pengguna (non-kustodial lewat Privy embedded wallet; mainnet kelak).
2. Data pribadi: email waitlist dan tester, alamat dompet, riwayat transaksi.
3. Akses beta: kode undangan dan tabel `beta_access`.
4. Rahasia: kunci service role Supabase, rahasia Privy, SMTP key Brevo, `CRON_SECRET`.

**Pelaku ancaman**
- Orang iseng atau bot yang mencoba masuk tanpa undangan.
- Tester yang membagikan kode atau menyalahgunakan akses.
- Penyerang yang mencoba memalsukan transaksi atau memanggil fungsi langsung.
- Kompromi akun admin atau kebocoran rahasia.

**Batas kepercayaan:** browser tidak dipercaya; edge function dipercaya setelah token Privy diverifikasi; database hanya diakses oleh edge function (service role).

## 1a. Model kustodi (keputusan produk)

- Penandatanganan tetap di tangan pengguna. Pukico **tidak** menjadi penanda tangan, tidak menyimpan kunci, dan tidak memegang dana pengguna. Server hanya menyimpan data (profil, catatan transaksi, akses).
- Kunci dompet dikelola Privy dengan key sharding; ini klaim vendor yang harus dikutip dari dokumentasi Privy dan ditinjau sebelum dipakai di materi publik. Klasifikasi hukum bukan keputusan dokumen ini.
- Konsekuensi yang harus jujur: server **tidak dapat** menahan transfer. Kontrol server adalah **pagar untuk aplikasi resmi** (intent, batas, saklar darurat, catatan audit), bukan penegakan di level dompet. Klien yang dimodifikasi tetap bisa menandatangani sendiri.
- Perlindungan pengguna di model ini datang dari: passkey/MFA (di tangan pengguna), tampilan tinjauan yang akurat, intent yang diterbitkan server, pagar kesalahan (batas, peringatan), dan pemulihan (cadangan MFA, ekspor kunci).

## 2. Kontrol yang sudah ada

| Kontrol | Status | Bukti |
|---|---|---|
| Token Privy diverifikasi di server (`jose`, kunci verifikasi) | Dibaca dari kode | `session`, `claim-pukico-id`, `tx`, `resolve-id`, `friends` |
| Email diambil dari Privy server, bukan dari browser | Dibaca dari kode | `claim-pukico-id` |
| RPC `claim_pukico_id` dan `pukico_id_status` tidak bisa dipanggil `anon`/`authenticated` | **Diverifikasi** | Query `has_function_privilege` menghasilkan false |
| Tabel akses memakai RLS tanpa policy (hanya service role) | Dari SQL migrasi | `invite_codes`, `beta_access`, `code_attempts` |
| Kode disimpan sebagai hash SHA-256; entropi sekitar 50 bit | Dari SQL | `create_invite_codes` |
| Kode sekali pakai, kedaluwarsa, bisa dicabut | Dari SQL dan diuji | Alur uji `kaitosogen` |
| Maksimal 5 percobaan kode gagal per 15 menit per akun | Dari SQL | `redeem_invite_code` |
| Transaksi divalidasi on-chain sebelum dicatat | Dibaca dari kode | `tx submit` |
| Gerbang di server untuk klaim ID dan pencatatan transaksi | **Diuji** | Pencabutan menolak di `tx`, banner di dashboard |
| Passkey MFA (Authenticator sebagai cadangan; SMS dimatikan) | **Diuji** | Verifikasi passkey muncul saat kirim |
| Email keluar: SPF, DKIM, DMARC PASS | **Diverifikasi** | "Tampilkan asli" di inbox penerima |
| Honeypot dan normalisasi email di waitlist | Dibaca dari kode | `join-waitlist` |
| Allowlist Privy dimatikan; akses diatur lewat kode | Konfigurasi | Dashboard Privy |

## 3. Celah dan risiko yang diketahui

Urut dari paling penting.

| # | Risiko | Dampak | Mitigasi sekarang | Perbaikan |
|---|---|---|---|---|
| 1 | **Pencabutan tidak membekukan dana (konsekuensi non-kustodial)** | Pengguna yang dicabut tetap memegang dan dapat memindahkan dananya | Pencabutan = menutup layanan Pukico (ID, pencatatan, riwayat, notifikasi); intent server menolak penerbitan | Tuliskan di Syarat Layanan; tidak ada penguncian dompet oleh server (keputusan produk) |
| 2 | **Blokir IP SMTP Brevo dimatikan** (agar Gmail bisa mengirim) | Pemegang SMTP key bisa mengirim email atas nama `hello@pukico.xyz` | Kunci hanya di Gmail; hapus kunci lama | Putar kunci berkala; pindah ke API/IP tetap lalu aktifkan lagi blokir |
| 3 | Kode tidak terikat ke satu email | Siapa pun yang memegang kode bisa memakainya | Satu kode per orang; cocokkan `email_hint` dengan `label`; cabut cepat | Ikat kode ke email di server (P2) |
| 4 | **Kode pernah tampil di screenshot dan chat** (mis. `PUKI-YNJP7-CUGHZ`) | Kode terbuka | Anggap terbakar; cabut bila belum dipakai | Jangan membagikan kode di luar email penerima |
| 5 | `email_hint` dari `session` bisa berasal dari browser | Tidak boleh dipakai untuk otorisasi | Tidak dipakai untuk akses | Tetap dilarang; dokumentasikan di kode |
| 6 | CORS `*` pada edge function | Origin mana pun dapat memanggil (token tetap wajib) | Bearer token wajib | Batasi ke `app.pukico.xyz` dan `pukico.xyz` |
| 7 | Antarmuka tinjauan transaksi dibuat aplikasi sendiri (modal Privy disembunyikan) | Frontend yang dikompromikan bisa menampilkan hal berbeda dari yang ditandatangani | Server memvalidasi pencatatan; hash dicatat | Resolve ulang penerima tepat sebelum tanda tangan; tampilkan detail teknis (alamat, kontrak) di "Details"; pertimbangkan modal Privy untuk mainnet; tambah CSP |
| 8 | Passkey opsional | Pengguna tanpa MFA hanya dilindungi sesi login | Dorongan di Settings | Wajib sebelum mainnet |
| 9 | Privy dalam mode development | Batas dan fitur bisa berbeda dari production | Hanya testnet | Upgrade dan tinjau domain yang diizinkan sebelum mainnet |
| 10 | DMARC `p=none` | Spoofing domain tidak diblokir, hanya dipantau | Dipantau lewat laporan | Naikkan ke `quarantine` lalu `reject` setelah stabil |
| 11 | RPC publik | Pembatasan laju, kemungkinan data tertunda | Polling dan retry | RPC sendiri |
| 12 | `VITE_DEMO_MODE` bila aktif memberi profil admin demo | Pengguna tampak admin | Variabel dikosongkan di production | Tambah pengecekan build agar demo tidak bisa aktif di production |
| 13 | Akun kosong dari orang yang login tanpa kode (allowlist mati) | Akun tak terpakai di Privy dan `profiles` | Gerbang menahan mereka | Pantau jumlahnya; ketatkan bila membengkak |
| 14 | Tidak ada pemantauan dan peringatan terpusat | Insiden terlambat diketahui | Cek manual log | Alert sederhana (error rate `tx`, lonjakan `no_access`) |
| 15 | **Transaksi yang tidak sempat tercatat** (aplikasi ditutup sebelum hash tersimpan, penyimpanan lokal terhapus) | Dana berpindah on-chain tetapi riwayat dan notifikasi Pukico tidak ada | Intent tercatat sebelum tanda tangan; pengiriman ulang dari `localStorage` saat dibuka; penjadwal untuk yang sudah tercatat | Cocokkan intent yang belum terpakai dengan transaksi dompet, atau pindai transfer masuk ke dompet terdaftar |
| 16 | **Fee lewat transaksi kedua tidak atomik** | Pengguna dapat melewatkan fee (menutup aplikasi, klien dimodifikasi) | Fee dihitung dan diverifikasi server; status `unpaid` tercatat; fee mati selama beta | Router kontrak atau smart wallet (batch atomik) sebelum fee menjadi pendapatan |
| 17 | **Kunci treasury** | Dana fee hilang atau dicuri | Alamat hanya di server; dompet khusus | Multisig (mis. Safe), bukan dompet pribadi atau dompet embedded admin; catat siapa penanda tangan |
| 18 | Fee dapat memicu kewajiban hukum (izin/lisensi, pajak) | Belum diketahui | Fee mati selama beta | Tinjauan hukum sebelum fee berlaku untuk uang sungguhan |

## 4. Aturan operasional

**Kode akses**
- Satu kode per orang; label `waitlist:EMAIL`.
- Kirim hanya ke email waitlist penerima, dari `hello@pukico.xyz`. Jangan kirim kode lewat Discord.
- Jangan menjalankan perintah pembuat kode dua kali; kode hanya tampil sekali.
- Kode yang bocor: cabut (`update invite_codes set revoked_at = now() where label = '...'`).

**Admin dan rahasia**
- Rahasia hanya di Supabase Secrets, Vercel Environment Variables, dan Gmail (SMTP key). Tidak di repo, chat, atau screenshot.
- Digest rahasia di dashboard Supabase boleh ditampilkan; nilai aslinya tidak.
- Role admin hanya untuk pemilik inti. Role `tester` tidak memberi hak akses khusus di server.
- Putar kunci bila ada dugaan kebocoran: Privy app secret, service role, `CRON_SECRET`, SMTP key.

**Perubahan produksi**
- Urutan: SQL, edge function, frontend. Uji dengan akun uji (bukan akun admin) setelah tiap perubahan akses.
- Cadangkan fungsi lama (unduh dari halaman fungsi) sebelum menimpanya.

## 5. Respons insiden (ringkas)

| Situasi | Langkah |
|---|---|
| Kode bocor | Cabut kode; cek `invite_codes.used_count` dan `beta_access` untuk pemakaian tak dikenal |
| Tester menyalahgunakan | Cabut `beta_access`; catat `pukico_id`; informasikan community lead |
| Dugaan SMTP key bocor | Hapus kunci di Brevo, buat baru, perbarui di Gmail |
| Dugaan rahasia Supabase/Privy bocor | Putar rahasia, deploy ulang fungsi, cek log akses |
| Transaksi aneh | Ambil `tx_hash`, cek di Basescan, cocokkan dengan tabel `transactions`, tahan undangan baru |
| Layanan error massal | Cek log `tx` dan `claim-pukico-id`; kembalikan fungsi dari cadangan |

## 6. Checklist per wave

- [ ] `VITE_DEMO_MODE` kosong di production
- [ ] Hanya satu SMTP key aktif di Brevo
- [ ] Tidak ada kode tersisa yang pernah tampil di tempat umum
- [ ] `select * from beta_funnel;` dan log `claim-pukico-id`/`tx` diperiksa
- [ ] Jumlah akun tanpa akses wajar (tidak membengkak)
- [ ] Tidak ada transaksi dengan status salah

## 7. Checklist sebelum mainnet (belum terpenuhi)

- [ ] Passkey/MFA wajib
- [ ] Kebijakan dompet yang menegakkan pencabutan di level transaksi
- [ ] Privy production, origin yang diizinkan ditinjau
- [ ] CORS dibatasi; CSP dipasang
- [ ] Resolve ulang penerima sebelum tanda tangan; detail teknis tersedia
- [ ] DMARC `quarantine` atau `reject`
- [ ] RPC sendiri dan pemantauan/alert
- [ ] Audit keamanan independen untuk edge function dan alur dompet
- [ ] Tinjauan hukum dan kepatuhan (belum dikaji di dokumen ini)
- [ ] Kebijakan privasi dan retensi data
