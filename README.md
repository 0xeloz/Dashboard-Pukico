# Pukico Dashboard

Dashboard web Pukico untuk mengirim dan menerima USDC memakai Pukico ID di Base Sepolia. Repo ini adalah aplikasi produk; landing page berada di repo terpisah (`Pukico`).

> **Status:** closed beta di testnet. Akses dashboard dibatasi `beta_access` — pengguna tanpa akses melihat layar kode akses. Token yang dipakai adalah USDC testnet Base Sepolia dan tidak bernilai uang.

Dokumen ini menggambarkan kode pada commit `d0864bd` (2 November 2026). Jika perilaku berubah, perbarui dokumen ini di commit yang sama.

Kejujuran status: dokumen ini **tidak** mengklaim build atau typecheck hijau. Angka dan kondisi yang ditulis di bagian [Status kualitas](#status-kualitas) berasal dari perintah yang benar-benar dijalankan di mesin pengembangan, dan setiap klaim menyebut alat serta versinya.

## Fitur yang ada

**Kirim**
- Kirim ke Pukico ID (di-resolve server-side) atau ke alamat `0x` eksternal.
- Langkah review sebelum tanda tangan: penerima, nominal, jaringan, service fee, estimasi network fee, dan total.
- Guard alamat: menolak zero address, alamat `dead`, alamat pengirim sendiri, dan alamat kontrak USDC.
- Peringatan alamat mirip (levenshtein) serta peringatan `address_changed` bila penerima pernah ditransfer dan alamat wallet-nya berubah sejak itu.
- Transaksi disimulasikan (`estimateGas`) sebelum tanda tangan, dan saldo dibaca ulang dari chain sebelum fee dibayar.
- Bila service fee aktif: **dua transaksi** — transfer utama lebih dulu, fee setelah receipt transfer utama masuk. Kegagalan fee disimpan sebagai fee tertunda dan bisa dibayar ulang; kegagalan fee tidak pernah dilaporkan sebagai transfer gagal.

**Terima** — QR berisi alamat wallet, salin alamat atau Pukico ID.

**Riwayat** — daftar transaksi, filter per aset/status, detail transaksi, dan receipt PNG yang bisa dibagikan.

**Teman** — daftar teman, pencarian, profil teman, tambah dan hapus.

**Notifikasi** — notifikasi transaksi terkirim/diterima/gagal; status baca dan "sudah dibersihkan" disimpan lokal per wallet.

**Onboarding dan klaim ID** — klaim Pukico ID, redeem kode akses beta, transisi splash.

**Discover** — enam misi onboarding: pilih Pukico ID, dapatkan token testnet, aktifkan passkey, tambah teman, kirim USDC pertama, kirim ke alamat eksternal.

**Pengaturan** — bahasa, passkey MFA, export wallet (Privy), info jaringan, tools demo.

**Dev** — inspeksi status RPC, saldo mentah, dan data sesi melalui rute `#dev` atau `/dev`.

## Yang belum ada

- **Request Money.** Tidak ada UI, modul API, maupun tabel di repo ini. Landing page mengarahkan `/p/<kode>` ke `https://app.pukico.xyz/#pay=<kode>`, tetapi dashboard belum mem-parse hash tersebut.
- **Scan QR kamera.** QR hanya dibuat, tidak dibaca.
- **Harga dan fiat.** Semua nominal berada dalam unit aset.

## Stack

Rentang versi di `package.json`: React `^19.0.1`, TypeScript `^7.0.2`, Vite `^8.3.0`, Tailwind CSS `^4.3.3`, `@privy-io/react-auth` `^3.50.0` (auth + wallet), viem `^2.57.7`, qrcode `^1.5.4`, lucide-react `^0.546.0`.

Karena belum ada lockfile, versi yang benar-benar terpasang bisa berbeda dari rentang di atas. Contoh nyata dari instalasi terakhir di mesin pengembangan: React 19.3.1, Vite 8.3.5, Privy 3.51.0, viem 2.57.14. Ini alasan teknis kenapa lockfile wajib, bukan sekadar kerapian.

Supabase dipakai lewat HTTP ke Edge Functions. Repo ini **tidak** memakai `supabase-js` di browser dan tidak menyimpan service-role key.

Scripts (sesuai `package.json`):

```bash
npm run dev      # vite --port=3000 --host=0.0.0.0
npm run build    # vite build
npm run lint     # tsc --noEmit
npm run preview
```

> `npm run lint` memakai TypeScript 7 dari `node_modules`, dan binary TS 7 **tidak tersedia untuk Android/Termux arm64** (lihat [Status kualitas](#status-kualitas)). Di mesin pengembangan ini perintah tersebut gagal karena platform, bukan karena error tipe. Verifikasi tipe dilakukan dengan TypeScript 5.9 yang dipanggil langsung.

> Belum ada `package-lock.json` di repo. Build belum reproducible dan versi dependency bisa bergeser antar instalasi. Kebijakan yang berlaku: lockfile masuk repo, pipeline memakai `npm ci`, dan typecheck dijalankan di CI — status pengerjaannya ada di `backlog.md` (`REL-01`, `TS-03`).

### Dependency Solana

`@solana-program/memo`, `@solana-program/system`, `@solana-program/token`, dan `@solana/kit` tidak dipakai langsung oleh kode Pukico — aplikasi beroperasi murni pada EVM Base Sepolia. Paket ini **wajib dipertahankan** karena dibutuhkan saat bundling akibat import peer dependency opsional pada `@privy-io/react-auth`. Menghapusnya memunculkan error `MISSING_EXPORT` saat `vite build`.

## Struktur

```
src/components/layout     AppLayout — shell, navigasi tab, header
src/components/views      Home, Receive, Friends, Discover, History, Settings,
                          Login, Onboarding, AccessCode, Dev, ComingSoon
  └ sheets                SendSheetContent (alur kirim), QuickActionSheets (Receive)
src/components/ui         BottomSheet, TxDetailsSheet, ActivityRow, NotificationPanel,
                          RecipientVerification, LanguagePopover, ToastViewport,
                          SplashScreen, PukicoBrand
src/context               Auth, Balance, Tx, Friends, Notifications, Toast
                          (+ PrivyConnectedProvider)
src/lib                   config, viemClient, fees, txGuards, txApi, feeRetry,
                          friendsApi, claimApi, sessionApi, notificationsApi,
                          receiptImage, addressSafety, externalRecipient,
                          formatters, iframeCompat
src/i18n                  en.ts, id.ts, index.tsx
src/types                 tipe bersama (ActiveTab, UserProfile, TxRecord, …)
supabase/functions/       resolve-id — satu-satunya edge function di repo ini
```

`src/components/views/ComingSoonView.tsx` masih di-import di `App.tsx` tetapi tidak pernah dirender — sisa fitur yang belum dipakai. Keputusan hapus/pakai ada di `backlog.md` (`DEV-01`, pemilik CTO), jadi belum diubah di repo ini.

## Environment

| Variabel | Fungsi |
| --- | --- |
| `VITE_PRIVY_APP_ID` | App ID Privy, harus 25 karakter. Wajib di produksi. |
| `VITE_DEMO_MODE` | `true` memaksa demo mode walau build produksi. |
| `VITE_REQUIRE_PASSKEY` | Default aktif. `false` mematikan gate passkey. |
| `VITE_SUPABASE_URL` | Base URL proyek Supabase untuk Edge Functions. |
| `VITE_SUPABASE_ANON_KEY` | Anon key untuk header `apikey`. |
| `VITE_TREASURY_ADDRESS` | Alamat penerima service fee. Kosong = fee nonaktif. |
| `VITE_FEE_BPS` | Fee dalam basis poin, 0–500 (maks 5%), default 50. |

Perilaku demo mode (`src/lib/config.ts`): pada build produksi hanya aktif bila `VITE_DEMO_MODE === 'true'`. Pada dev, demo mode otomatis aktif bila `VITE_PRIVY_APP_ID` tidak valid dan `VITE_DEMO_MODE` bukan `'false'`. Produksi tanpa App ID valid menampilkan layar konfigurasi hilang, bukan demo.

## Menjalankan

```bash
npm install
cp .env.example .env.local   # isi nilainya
npm run dev
npm run build
```

Typecheck tidak dijalankan lewat `npm run lint` di mesin ini (TS 7 tidak tersedia untuk Android arm64). Perintah penggantinya ada di [Status kualitas](#status-kualitas).

Tanpa `.env`, pada dev aplikasi berjalan di demo mode dengan profil contoh dan 86 transaksi contoh.

## Model biaya

Service fee dihitung dari `VITE_FEE_BPS` terhadap nominal: untuk USDC dibulatkan ke bawah ke kelipatan 0,01 USDC dengan minimum 0,01 USDC; untuk ETH memakai ceil division. Fee dikirim sebagai transaksi terpisah ke alamat treasury. Bila treasury tidak dikonfigurasi atau bps bernilai 0, fee nonaktif dan hanya satu transaksi yang dibuat. Detail teknis ada di [arsitektur.md](arsitektur.md).

## Keamanan

Kontrol yang sudah berjalan, risiko terbuka, dan checklist rilis ada di [security.md](security.md). Ringkas: aplikasi non-custodial dan private key tidak pernah menyentuh aplikasi, tetapi verifikasi token di edge function `resolve-id` belum dilakukan — lihat bagian risiko terbuka.

## Status kualitas

Bagian ini menyatakan apa yang benar-benar bisa dan belum bisa dibuktikan di repo ini. Tidak ada klaim "hijau" tanpa perintah yang dijalankan.

**Typecheck tidak bisa memakai TypeScript 7 di mesin pengembangan.**
`package.json` memasang `typescript@^7.0.2`, dan TS 7 memakai binary per platform. Paket `@typescript/typescript-android-arm64` tidak tersedia, sehingga `npm run lint` maupun `npx tsc` gagal dengan:

```
Error: Unable to resolve @typescript/typescript-android-arm64.
```

Itu kegagalan platform, bukan laporan error tipe. Verifikasi tipe dilakukan dengan **TypeScript 5.9.3 yang dipanggil langsung** (bukan `npx`, karena `npx` memakai bin lokal TS 7):

```bash
node ~/.hermes/cache/scratch/ts5/node_modules/typescript/bin/tsc --noEmit
```

Angka di bawah adalah keluaran perintah itu pada commit `d0864bd`, bukan perkiraan.

**Ada 16 error tipe di TypeScript 5.9.3 yang belum diperbaiki.** `tsconfig.json` mengecualikan `supabase`, jadi hitungan ini hanya mencakup `src/`.

| Lokasi | Jumlah | Error |
| --- | --- | --- |
| `components/views/OnboardingView.tsx` | 5 | `Property 'error' does not exist on type 'ClaimResult'` |
| `components/views/sheets/SendSheetContent.tsx` | 5 | `Property 'reason' does not exist on type 'ExternalAddressValidation'` |
| `components/views/AccessCodeView.tsx` | 1 | `Property 'reason' does not exist on type 'RedeemAccessCodeResult'` |
| `lib/externalRecipient.ts` | 2 | `Property 'reason' does not exist on type 'RecipientCheckResult'` |
| `lib/txGuards.ts` | 1 | argumen `readContract` tidak cocok (field `authorizationList` hilang) |
| `lib/viemClient.ts` | 1 | argumen `readContract` tidak cocok (field `authorizationList` hilang) |
| `context/PrivyConnectedProvider.tsx` | 1 | `Property 'address' does not exist` pada tipe akun Privy |

Pembagian pemilik dan kriteria selesainya ada di `backlog.md` (`TS-01` untuk Cuki, `TS-02` untuk Petot). Kriteria selesai: **0 error pada TS 5.9**, disertai catatan bahwa TS 7 belum diverifikasi untuk kode ini — bukan diklaim sudah diverifikasi.

**Belum ada test otomatis.** Tidak ada file `*.test.*`, `*.spec.*`, maupun konfigurasi Vitest/Jest di repo. Artinya tidak ada satu pun regresi yang bisa ditangkap mesin; semua verifikasi saat ini manual. Fungsi murni yang paling layak diuji lebih dulu adalah `computeServiceFee`, `computeMaxSendable`, `computeEthRequirement`, dan `checkRecipientAddress` (`TEST-01`).

**Belum ada lockfile.** `package-lock.json` tidak ada di repo, jadi pohon dependency tidak dapat direproduksi. Kebijakan yang berlaku: lockfile di-commit, `npm ci` di pipeline, dan typecheck dijalankan di CI karena tidak bisa dijalankan di mesin lokal (`REL-01`, `TS-03`).

**Build terakhir yang benar-benar dijalankan:** `./node_modules/.bin/vite build` pada commit `d0864bd` selesai dengan exit 0 dalam 6,13 detik, dengan satu peringatan chunk di atas 500 kB. Ini bukti build, bukan bukti tipe — Vite tidak melakukan typecheck, jadi build yang lolos tetap bisa menyimpan 16 error tipe di atas. Tanpa lockfile, hasil ini hanya berlaku untuk pohon dependency di mesin tersebut.

## Tim dan proses

Pukico dikerjakan oleh satu CEO manusia dan lima agen AI. Aturan kerja, backlog bertanggal, dan profil setiap agen berada di **repo privat `0xeloz/Pukico-Team`** (`https://github.com/0xeloz/Pukico-Team`), bukan di repo ini. Repo ini hanya berisi kode produk; keputusan dan pembagian tugas tidak disimpan di sini.

| Peran | Agen | Domain | Profil |
| --- | --- | --- | --- |
| CTO | Ficu | Arsitektur, standar teknis, pemecahan tugas, merge | `agents/cto-ficu.md` |
| Frontend | Cuki | UI, komponen, i18n, aksesibilitas | `agents/frontend-cuki.md` |
| Software | Petot | Logika, API, edge function, test | `agents/software-petot.md` |
| QA | Jojon | Bukti kelayakan, definisi "selesai" | `agents/qa-jojon.md` |
| Security | Botai | Veto pada risiko yang memblokir rilis | `agents/security-botai.md` |

Aturan yang mengikat pekerjaan di repo ini:

1. **Satu tugas, satu pemilik.** Kalau sebuah perubahan menyentuh UI dan logika sekaligus, CTO memecahnya menjadi dua tiket — tidak dikerjakan bersamaan oleh dua agen.
2. **Tidak ada merge tanpa gate.** PR masuk setelah QA (bukti) dan Security (dampak) selesai. Security memblokir berarti dibahas, bukan dilewati; hanya CEO yang boleh menerima risiko secara eksplisit.
3. **Klaim harus punya bukti.** Setiap tiket selesai dengan blok serah-terima berisi perintah yang dijalankan dan keluarannya, bukan "sudah dikerjakan".
4. **Dokumen mengikuti kode.** `README.md`, `arsitektur.md`, `designsystem.md`, dan `security.md` diperbarui di PR yang mengubah perilakunya.
5. **Dependency dan arsitektur butuh alasan tertulis.** Penambahan dependency atau perubahan arsitektur ditolak bila alasannya tidak dicatat di `arsitektur.md` bagian keputusan desain.

Prioritas kerja saat ini ada di `backlog.md` pada repo tim. Tahap 0 adalah pemblokir rilis dan tidak boleh ditunda oleh tahap lain: verifikasi JWT di `resolve-id` (SEC-01), CORS dibatasi (SEC-02), status empat Edge Function yang tidak ada di repo (SEC-03), penghentian fee saat receipt gagal (SEC-04), dan penghapusan sukses palsu saat backend mati (LP-01).

## Dokumentasi

- [arsitektur.md](arsitektur.md) — komponen, alur transfer, kontrak backend
- [designsystem.md](designsystem.md) — token visual dan pola interaksi
- [security.md](security.md) — kontrol keamanan dan risiko terbuka
- [PRD.md](PRD.md) — kebutuhan produk
- [Security specifications.md](Security%20specifications.md) — spesifikasi keamanan

Dokumen tim tidak disimpan di repo ini. Aturan kerja, backlog, dan profil agen ada di repo privat `0xeloz/Pukico-Team`; rujukannya hanya untuk membaca, sedangkan perubahan kode tetap terjadi di repo ini.
