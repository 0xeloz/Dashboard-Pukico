# Keamanan Pukico Dashboard

**Status:** Diverifikasi terhadap kode commit `c8d90ef` (2 November 2026). Dokumen ini mencatat kontrol yang benar-benar ada di kode, risiko yang masih terbuka, dan apa yang harus ditutup sebelum rilis. Ini bukan hasil audit keamanan independen.

## 1. Prinsip

- Pengguna menyetujui setiap transaksi lewat wallet Privy. Aplikasi tidak pernah meminta atau menyimpan private key.
- Frontend bukan sumber kebenaran status pembayaran.
- Setiap permintaan backend harus diautentikasi dan diotorisasi di sisi server.
- Kegagalan harus terlihat sebagai kegagalan, bukan ditutupi data simulasi.
- Data contoh hanya boleh muncul di mode demo yang eksplisit.

## 2. Model kepercayaan

| Pihak | Dipercaya untuk | Tidak dipercaya untuk |
| --- | --- | --- |
| Privy | Login, penyimpanan wallet, tanda tangan | Menentukan status transaksi |
| viem / RPC | Membaca saldo, estimasi gas, receipt | — |
| Edge Function | Autorisasi, pencatatan, verifikasi transaksi | — |
| Browser | Menampilkan UI, menyiapkan payload | Menentukan nominal, status, atau identitas |

Payload yang dikirim browser (`amount`, `email`, `wallet_address`, `tx_hash`) adalah klaim, bukan bukti. Backend wajib menurunkannya ulang dari token dan chain.

## 3. Autentikasi

Setiap panggilan ke Edge Function membawa `x-privy-token` (hasil `getAccessToken()` Privy) dan `apikey` (anon key). `buildHeaders` di `src/lib/txApi.ts` adalah satu-satunya tempat header ini dirakit.

### R-01 — Token tidak diverifikasi (kritis)

`supabase/functions/resolve-id/index.ts:16` (`extractDidFromPrivyToken`) memecah JWT, melakukan base64-decode payload, dan membaca `sub` / `user_id` / `privy_did`. **Signature tidak pernah diperiksa.** Siapa pun dapat menyusun token `{"sub":"did:privy:<korban>"}` bertanda tangan sembarang dan diterima sebagai pengguna tersebut.

Dampaknya diperbesar dua hal:

- Function memakai client dengan `SUPABASE_SERVICE_ROLE_KEY` (`index.ts:73`), sehingga Row Level Security tidak ikut membatasi.
- Nilai balik function memuat `wallet_address` milik target, jadi enumerasi Pukico ID → alamat wallet menjadi mudah.

Komentar di kode menyatakan verifikasi "di produksi", tetapi tidak ada implementasinya. Anggap fungsi ini **belum aman untuk dipakai dengan data nyata**.

Perbaikan yang diperlukan:

1. Verifikasi JWT terhadap JWKS Privy (`https://auth.privy.io/api/v1/apps/<app_id>/jwks.json`) memakai `jose` atau `jwtVerify`.
2. Tolak token dengan `exp` lewat, `aud` tidak cocok dengan App ID, atau `iss` bukan `privy.io`.
3. Setelah itu baru ambil `sub` sebagai DID.
4. Terapkan pola yang sama di empat fungsi lain yang tidak ada di repo ini sebelum dipakai produksi.

### R-02 — CORS terbuka (tinggi)

`Access-Control-Allow-Origin: *` di `resolve-id/index.ts:5`. Digabung dengan R-01, situs mana pun dapat memanggil endpoint atas nama pengguna yang tokennya berhasil dipalsukan. Batasi ke origin aplikasi (`https://app.pukico.xyz`) dan origin preview yang dikenal.

## 4. Otorisasi

- Dashboard tidak memakai `supabase-js` di browser dan tidak memegang service-role key, sehingga tidak ada jalur langsung ke database dari klien.
- Semua otorisasi terjadi di Edge Function. Karena function memakai service role, **RLS tidak akan menyelamatkan operasi yang lupa memeriksa pemilik data**. Pemeriksaan harus eksplisit di setiap action.
- `resolve-id` sudah memeriksa bahwa pemanggil punya profil dan, bila belum punya Pukico ID, mengembalikan `403 onboarding_required` kecuali `role = admin`.
- Profil memuat `role` dan `beta_access`; keduanya dipakai untuk gating UI. Gating UI bukan kontrol keamanan — server harus menolak sendiri, bukan mengandalkan tombol yang disembunyikan.

### R-03 — Empat fungsi backend tidak ada di repo (tinggi)

`tx`, `friends`, `claim-pukico-id`, dan `session` dipanggil frontend tetapi tidak ada di `supabase/functions/`. Otorisasi, verifikasi transaksi, dan policy di dalamnya **tidak dapat diperiksa dari repo ini**, sehingga tidak bisa dinyatakan aman maupun tidak. Ini harus diselesaikan sebelum klaim keamanan apa pun dibuat.

Khusus `/session`: frontend mengirim `email` dan `wallet_address` (`src/lib/sessionApi.ts`). Server harus menurunkan DID dari token dan tidak boleh mengikat wallet_address ke akun hanya karena klien mengirimkannya.

## 5. Verifikasi transaksi

Yang sudah berjalan:

- Transaksi disimulasikan (`estimateGas`) sebelum tanda tangan; kegagalan membatalkan lebih awal.
- Hash divalidasi formatnya (`isTxHash`) sebelum disimpan atau dikirim.
- Hash yang sudah disiarkan dicatat di `pukico.pendingTx` dan dikirim ulang pada sesi berikutnya, jadi tidak hilang bila tab ditutup.
- Submit mengulang saat backend menjawab `202 tx_not_found_yet`, maksimal 20 detik.
- Status akhir diambil dari `/tx` (`sync`, `sync_pending`, `list`), bukan dari respons submit.
- Transaksi `pending` dan `failed` ditampilkan apa adanya dan tidak pernah dipromosikan menjadi sukses oleh UI.

### R-04 — Status receipt tidak diperiksa sebelum fee dikirim (sedang)

`SendSheetContent.tsx:1960` menunggu `waitForTransactionReceipt` dengan timeout 60 detik, tetapi hasilnya tidak diperiksa. Bila transaksi di-revert atau waktu tunggu habis, blok `catch` hanya mencatat log (`:1964`) dan alur **tetap melanjutkan pembayaran fee** ke treasury. Akibatnya pengguna bisa membayar biaya layanan untuk transfer yang gagal.

Perbaikan: periksa `receipt.status === 'success'` dan hentikan alur fee bila tidak; bedakan timeout (transaksi mungkin masih diproses) dari revert (transaksi gagal).

## 6. Nominal dan biaya

- Seluruh perhitungan uang memakai `bigint` pada unit terkecil (`parseUnits`, `formatUnits`). Tidak ada float di jalur transaksi.
- Fee dibatasi maksimum 500 bps (`MAX_FEE_BPS`) dan dinonaktifkan sepenuhnya bila treasury tidak dikonfigurasi atau bps 0.
- Fee USDC dibulatkan ke bawah ke kelipatan 0,01 USDC dengan minimum 0,01 USDC; ETH memakai ceil division.
- Kebutuhan gas dihitung dengan buffer 150% (`computeGasReserve`), dan saldo dibaca ulang dari chain tepat sebelum fee dikirim.
- Estimasi gas selalu diberi label estimasi dan tidak pernah digabung dengan nominal USDC.

Catatan: `amount` tetap dikirim dari klien ke `/tx`. Backend wajib membuktikan nominal dan penerima dari receipt on-chain, bukan dari payload.

## 7. Guard alamat dan penerima

`src/lib/txGuards.ts` menolak: alamat tidak valid, zero address, alamat `dead`, alamat pengirim sendiri, dan alamat kontrak USDC. `src/lib/addressSafety.ts` membandingkan alamat tujuan dengan alamat transaksi sebelumnya memakai jarak levenshtein untuk memperingatkan alamat mirip, dan menampilkan alamat dalam bentuk checksum yang dipotong di tengah. `resolve-id` mengembalikan `address_changed` bila penerima berganti wallet sejak transaksi terakhir, dan UI menampilkan peringatan sebelum pengguna melanjutkan.

## 8. Data lokal

Aplikasi tidak menyimpan access token, private key, atau kredensial di kode maupun storage-nya sendiri — setiap panggilan mengambil token dari Privy saat dibutuhkan dan mengirimnya sebagai header. Yang tersimpan di browser hanya cache dan preferensi: `pukico.pendingTx`, `pukico.fee_due.<wallet>`, `pukico_tx_cache_<wallet>`, `pukico_balance_cache_<wallet>`, `pukico_friends_cache_<wallet>`, `pukico.notif.*.<wallet>`, `pukico.lang`. (Privy sendiri mengelola sesi login dengan mekanisme internalnya.)

### R-06 — Cache tidak dibersihkan saat logout (rendah)

`PrivyConnectedProvider.tsx:203` hanya menghapus `pukico.history_filters` dari sessionStorage lalu memanggil logout Privy. Cache transaksi, saldo, teman, dan fee tertunda tetap ada di localStorage. Pada perangkat bersama, orang berikutnya yang login dengan akun lain tidak melihat data tersebut (key di-scope per alamat wallet), tetapi data tetap tersimpan di disk tanpa batas waktu dan tanpa enkripsi.

Perbaikan: hapus key milik wallet saat logout, atau setidaknya sediakan aksi "hapus data lokal" di Pengaturan.

## 9. Secret

- Anon key Supabase ada di bundle frontend (`VITE_SUPABASE_ANON_KEY`). Ini by design, tetapi hanya aman selama RLS/otorisasi di server benar.
- Service-role key hanya dibaca dari `Deno.env` di Edge Function dan tidak pernah masuk repo.
- Pemindaian repo tidak menemukan token, private key, atau service-role key yang ter-commit.

## 10. Header keamanan (`vercel.json`)

| Header | Nilai | Catatan |
| --- | --- | --- |
| `Content-Security-Policy` | `frame-ancestors 'none'` | Satu-satunya directive yang ditegakkan |
| `X-Frame-Options` | `DENY` | Mencegah framing |
| `X-Content-Type-Options` | `nosniff` | — |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | — |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` | — |
| `Strict-Transport-Security` | `max-age=31536000` | Belum `includeSubDomains` / `preload` |
| `Content-Security-Policy-Report-Only` | policy lengkap + `report-uri` | **Hanya melaporkan, tidak memblokir** |

### R-07 — CSP belum menegakkan apa pun (sedang)

Policy lengkap dikirim sebagai `Report-Only`. Selama masih report-only, injeksi script pihak ketiga tidak dicegah. Setelah laporan bersih di produksi, pindahkan policy yang sama ke `Content-Security-Policy` dan pertahankan `frame-ancestors 'none'`.

## 11. Rantai pasokan dan build

### R-08 — Tidak ada lockfile (sedang)

Tidak ada `package-lock.json` di repo. Instalasi bisa menghasilkan pohon dependency berbeda antar mesin dan antar waktu, termasuk untuk paket yang menyentuh jalur wallet dan transaksi. Tambahkan lockfile dan pakai `npm ci` di CI.

Tidak ada test otomatis di repo. Matematika fee dan guard alamat adalah fungsi murni yang paling mudah diuji dan paling mahal bila salah.

## 12. Checklist sebelum rilis

- [ ] **Verifikasi JWT di setiap Edge Function** (R-01) — saat ini gagal.
- [ ] **CORS dibatasi ke origin aplikasi** (R-02) — saat ini `*`.
- [ ] Empat fungsi backend yang tidak ada di repo ditinjau dan di-deploy dari sumber yang terkontrol (R-03).
- [ ] `receipt.status` diperiksa sebelum fee dikirim (R-04).
- [ ] CSP ditegakkan, bukan report-only (R-07).
- [ ] Lockfile ditambahkan dan build memakai `npm ci` (R-08).
- [x] Tidak ada secret yang ter-commit.
- [x] Service-role key tidak ada di bundle frontend.
- [x] Transaksi `pending` dan `failed` tidak pernah ditampilkan sebagai sukses.
- [x] Nominal dan fee dihitung dengan integer unit, tanpa float.
- [x] Alamat berisiko (zero, dead, self, kontrak USDC) ditolak sebelum tanda tangan.
- [x] Tidak ada alur yang memindahkan dana tanpa persetujuan eksplisit pengguna.
- [x] Error tidak diganti data contoh di build produksi — mode demo hanya aktif bila diminta eksplisit.
- [ ] RLS dan policy diuji dengan lebih dari satu akun di proyek Supabase aktif.
- [ ] Uji end-to-end di Base Sepolia setelah semua perbaikan di atas.

## 13. Risiko terbuka

| ID | Tingkat | Ringkas |
| --- | --- | --- |
| R-01 | Kritis | JWT hanya di-decode, tidak diverifikasi → impersonasi akun |
| R-02 | Tinggi | CORS `*` memperluas dampak R-01 ke semua origin |
| R-03 | Tinggi | Empat Edge Function tidak ada di repo, tidak dapat ditinjau |
| R-04 | Sedang | Fee dapat terbayar walau transfer gagal/revert |
| R-07 | Sedang | CSP report-only, tidak memblokir |
| R-08 | Sedang | Tanpa lockfile, build tidak reproducible |
| R-06 | Rendah | Cache lokal tidak dibersihkan saat logout |

## 14. Pelaporan kerentanan

Jangan mempublikasikan kredensial atau langkah eksploitasi di issue publik. Gunakan kanal kontak keamanan resmi Pukico. Bila belum tersedia, siapkan sebelum membuka program pelaporan publik.

Dokumen ini adalah panduan dan catatan status, bukan jaminan keamanan.
