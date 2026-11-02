# Pukico Dashboard

Dashboard web Pukico untuk mengirim dan menerima USDC memakai Pukico ID di Base Sepolia. Repo ini adalah aplikasi produk; landing page berada di repo terpisah (`Pukico`).

> **Status:** closed beta di testnet. Akses dashboard dibatasi `beta_access` — pengguna tanpa akses melihat layar kode akses. Token yang dipakai adalah USDC testnet Base Sepolia dan tidak bernilai uang.

Dokumen ini menggambarkan kode pada commit `c8d90ef` (2 November 2026). Jika perilaku berubah, perbarui dokumen ini di commit yang sama.

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

React 19.0.1, TypeScript 7.0.2, Vite 8.3.0, Tailwind CSS 4.3.3, `@privy-io/react-auth` 3.50.0 (auth + wallet), viem 2.57.7, qrcode 1.5.4, lucide-react 0.546.0.

Supabase dipakai lewat HTTP ke Edge Functions. Repo ini **tidak** memakai `supabase-js` di browser dan tidak menyimpan service-role key.

Scripts:

```bash
npm run dev      # vite --port=3000 --host=0.0.0.0
npm run build    # vite build
npm run lint     # tsc --noEmit
npm run preview
```

> Belum ada `package-lock.json` di repo. Build belum reproducible dan versi dependency bisa bergeser antar instalasi. Tambahkan lockfile sebelum rilis.

### Dependency Solana

`@solana-program/memo`, `@solana-program/system`, `@solana-program/token`, dan `@solana/kit` tidak dipakai langsung oleh kode Pukico — aplikasi beroperasi murni pada EVM Base Sepolia. Paket ini **wajib dipertahankan** karena dibutuhkan saat bundling akibat import peer dependency opsional pada `@privy-io/react-auth`. Menghapusnya memunculkan error `MISSING_EXPORT` saat `vite build`.

## Struktur

```
src/components/layout     AppLayout — shell, navigasi tab, header
src/components/views      Home, Receive, Friends, Discover, History, Settings,
                          Login, Onboarding, AccessCode, Dev
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
src/i18n                  en.ts, id.ts
supabase/functions/       resolve-id — satu-satunya edge function di repo ini
```

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
npm run lint                 # tsc --noEmit
npm run dev
npm run build
```

Tanpa `.env`, pada dev aplikasi berjalan di demo mode dengan profil contoh dan 86 transaksi contoh.

## Model biaya

Service fee dihitung dari `VITE_FEE_BPS` terhadap nominal: untuk USDC dibulatkan ke bawah ke kelipatan 0,01 USDC dengan minimum 0,01 USDC; untuk ETH memakai ceil division. Fee dikirim sebagai transaksi terpisah ke alamat treasury. Bila treasury tidak dikonfigurasi atau bps bernilai 0, fee nonaktif dan hanya satu transaksi yang dibuat. Detail teknis ada di [arsitektur.md](arsitektur.md).

## Keamanan

Kontrol yang sudah berjalan, risiko terbuka, dan checklist rilis ada di [security.md](security.md). Ringkas: aplikasi non-custodial dan private key tidak pernah menyentuh aplikasi, tetapi verifikasi token di edge function `resolve-id` belum dilakukan — lihat bagian risiko terbuka.

## Dokumentasi

- [arsitektur.md](arsitektur.md) — komponen, alur transfer, kontrak backend
- [designsystem.md](designsystem.md) — token visual dan pola interaksi
- [security.md](security.md) — kontrol keamanan dan risiko terbuka
- [PRD.md](PRD.md) — kebutuhan produk
- [Security specifications.md](Security%20specifications.md) — spesifikasi keamanan
