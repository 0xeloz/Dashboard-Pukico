# Pukico: Arsitektur

Versi: 0.1 · Berdasarkan kode edge function, dashboard, dan landing per akhir Oktober 2026. Hal yang tidak bisa dipastikan dari kode ditandai **[Perlu dikonfirmasi]**.

## 1. Gambaran sistem

```text
                    ┌──────────────┐
  Pengunjung ─────► │ pukico.xyz   │  Landing (Vite + React), Vercel
                    └──────┬───────┘
                           │ join-waitlist, check-username
                           ▼
 ┌─────────────┐   ┌────────────────────────────┐   ┌───────────────┐
 │ app.pukico  │──►│ Supabase Edge Functions    │──►│ Postgres      │
 │ .xyz        │   │ session, claim-pukico-id,  │   │ (RLS aktif)   │
 │ Dashboard   │   │ resolve-id, friends, tx    │   └───────────────┘
 │ (Vite+React │   └─────────┬──────────────────┘
 │  Vercel)    │             │ verifikasi JWT, ambil email
 └──────┬──────┘             ▼
        │               ┌─────────┐
        │ login, dompet │  Privy  │  Auth email + embedded wallet + MFA passkey
        └──────────────►└────┬────┘
                            │ tanda tangan transaksi
                            ▼
                   ┌──────────────────┐
                   │ Base Sepolia RPC │  Testnet (RPC publik untuk beta)
                   └──────────────────┘
```

## 2. Komponen

| Komponen | Teknologi | Peran |
|---|---|---|
| Landing `pukico.xyz` | Vite, React, TypeScript, Tailwind v4 | Pemasaran, waitlist, i18n en/id |
| Dashboard `app.pukico.xyz` | Vite, React 19, TypeScript, Tailwind v4, viem | Aplikasi: login, kode akses, kirim, terima, riwayat, teman, settings |
| Auth dan dompet | Privy (`@privy-io/react-auth` ^3.50) | Login email, embedded wallet Ethereum, MFA passkey |
| Backend | Supabase Edge Functions (Deno, TypeScript) | Logika bisnis, verifikasi token, akses database |
| Database | Supabase Postgres | Data profil, transaksi, waitlist, akses |
| Jaringan | Base Sepolia (chain ID 84532) | Transaksi USDC dan ETH testnet |
| Hosting | Vercel (dua project terpisah) | Deploy otomatis dari GitHub |
| Email masuk | ImprovMX (forwarding `hello@pukico.xyz`) | Menerima email |
| Email keluar | Brevo SMTP lewat Gmail "Kirim email sebagai" | SPF, DKIM, DMARC terautentikasi |
| DNS | Jagoan Hosting | Record domain |
| Komunitas | Discord | Tester, role Tester |
| Pengembangan | AI Studio (dua project) | Penulisan kode frontend |

## 3. Edge Functions

| Function | Action | Fungsi |
|---|---|---|
| `join-waitlist` | (publik) | Simpan email (dinormalisasi) dan ID pilihan; honeypot |
| `check-username` | (publik) | Cek ketersediaan ID |
| `session` | (token Privy) | Sinkronkan profil; kembalikan `profile` dengan `beta_access` |
| `claim-pukico-id` | `init`, `check`, `claim`, `redeem` | Status ID, validasi, klaim ID, tukar kode akses |
| `resolve-id` | (token Privy) | Ubah Pukico ID menjadi alamat dompet |
| `friends` | `list`, `search`, `profile`, `add`, `remove` | Daftar teman |
| `tx` | `prepare`, `submit`, `sync`, `sync_pending`, `list`, `notifications`, `mark_read` | Catat dan validasi transaksi, riwayat, notifikasi; dipanggil juga oleh cron |

Prinsip bersama: token Privy diverifikasi dengan `jose` memakai kunci verifikasi; fungsi memakai kunci service role untuk akses database; email selalu diambil dari Privy server, bukan dari data browser.

## 4. Model data

### Tabel inti
- `profiles`: `privy_did`, `pukico_id`, `wallet_address`, `role`, `email_hint`, status verifikasi dompet.
- `waitlist`: `email`, `email_normalized`, `desired_id`, `created_at`, `invited_at`, `claimed_at`.
- `reserved_usernames`: ID yang dicadangkan.
- `friends`, `notifications`.
- `transactions`: `tx_hash`, `chain_id`, `asset`, `amount_raw`, `amount_display`, `from_did`, `to_did`, alamat, `from_pukico_id`, `to_pukico_id`, `status`, `block_number`, `created_at`, `confirmed_at`.

### Tabel gerbang akses (baru)
- `invite_codes`: `code_hash` (SHA-256), `label`, `cohort`, `max_uses`, `used_count`, `expires_at`, `revoked_at`, `created_by_did`.
- `beta_access`: `privy_did` (kunci), `code_id`, `cohort`, `granted_at`, `revoked_at`.
- `code_attempts`: percobaan kode (untuk pembatasan).
- View `beta_funnel`: granted, claimed_id, sent_tx, repeat_users per cohort.

### Fungsi SQL
- `claim_pukico_id`, `pukico_id_status` (sudah ada; tidak dapat dijalankan oleh `anon`/`authenticated`).
- `create_invite_codes(count, label, cohort, days)`: dipakai admin.
- `redeem_invite_code(did, code)`: dipanggil edge function.

## 5. Alur kunci

### 5.1 Masuk dan akses
1. Pengguna login di Privy; dashboard memanggil `session`.
2. `session` mengembalikan profil dengan `beta_access` (true bila ada baris aktif di `beta_access` atau role admin).
3. Jika `pukico_id` kosong dan tidak ada akses: tampil layar kode akses. Layar itu memanggil `init` untuk menampilkan status waitlist.
4. `redeem` menukar kode lewat `redeem_invite_code`; sukses membuat baris `beta_access`.
5. `claim` memeriksa akses lagi di server sebelum memanggil `claim_pukico_id`.

### 5.2 Kirim transaksi
1. Pengguna memilih penerima. `resolve-id` mengembalikan alamat.
2. Tinjauan ditampilkan oleh aplikasi (Pukico ID, jumlah, aset, jaringan, biaya).
3. `sendTransaction` Privy dipanggil dengan `showWalletUIs: false`; bila passkey aktif, modal verifikasi Privy muncul.
4. Hash dikembalikan; disimpan di `localStorage` (`pukico.pendingTx`) dan dikirim ke `tx submit`.
5. `tx submit` memeriksa akses pengirim, lalu memvalidasi transaksi on-chain (pengirim, penerima, aset, jumlah) sebelum mencatat.
6. Aplikasi memanggil `tx sync` tiap 3 detik, maksimal 90 detik. Hasil: confirmed, failed, atau timeout ("masih dicek").
7. Penjadwal Supabase (header `x-cron-secret`) menyinkronkan semua transaksi pending tanpa menunggu pengguna. Klien juga memanggil `sync_pending` dan mengirim ulang hash dari `localStorage` (`resubmitPendingTransactions`) saat aplikasi dibuka.

**Jika pengguna menutup aplikasi di tengah proses:**
- Sebelum hash dibuat (modal passkey masih terbuka): tidak ada transaksi.
- Setelah hash dibuat: transaksi on-chain berjalan sendiri. Hash disimpan di `localStorage` lalu dikirim ke `tx submit`; jika aplikasi tertutup sebelum submit, pengiriman diulang saat dibuka kembali di perangkat dan browser yang sama.
- Setelah submit berhasil: penjadwal yang mengonfirmasi dan membuat notifikasi, tanpa bergantung pada klien.
- Celah: hash yang tidak sempat disimpan atau penyimpanan yang terhapus (mode incognito, ganti perangkat) membuat transaksi on-chain tidak tercatat di Pukico.

### 5.3 Pencabutan akses
Admin mengisi `revoked_at` di `beta_access`. Efek: dashboard menyembunyikan alur kirim setelah sesi disegarkan; `claim` dan `tx submit` menolak dengan `no_access`. **Transfer on-chain dari dompet pengguna tidak dihentikan** (lihat `security.md`).

### 5.4 Fee ke treasury (mati secara bawaan)
Server adalah sumber kebenaran: `TREASURY_ADDRESS` dan `FEE_BPS` hanya di Supabase Secrets. `prepare` menghitung fee dan menyimpannya di intent (`fee_raw`, `fee_treasury`). Klien membayar fee sebagai transaksi kedua, lalu menyertakan `fee_tx_hash` ke `submit`. Server memeriksa transaksi fee on-chain terhadap intent, bukan terhadap angka dari klien. Status fee: `none`, `unpaid`, `pending`, `paid`, `failed`, `invalid`. Batasan: dua transaksi tidak atomik, jadi fee bisa tidak terbayar bila pengguna meninggalkan aplikasi; mekanisme atomik (router kontrak atau smart wallet) diperlukan sebelum mainnet.

## 6. Rahasia dan konfigurasi

Nama rahasia di Supabase (nilai tidak boleh masuk repo atau chat): `DB_SECRET_KEY`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_VERIFICATION_KEY`, `CRON_SECRET`. Untuk fee: `TREASURY_ADDRESS` (alamat publik, tetap disimpan di server) dan `FEE_BPS`.

Variabel Vercel: `VITE_PRIVY_APP_ID`, URL Supabase, kunci publik; **`VITE_DEMO_MODE` harus kosong di production**.

Secret lain: SMTP key Brevo (disimpan di pengaturan Gmail, bukan di kode).

## 7. Deploy

| Bagian | Cara | Catatan |
|---|---|---|
| Frontend (dua project) | Push ke GitHub, Vercel membangun otomatis | Pastikan deploy berstatus Ready sebelum uji |
| Edge functions | Tempel `index.ts` di Supabase atau deploy CLI | Jangan ubah pengaturan Verify JWT yang ada |
| SQL | Supabase SQL Editor | Cadangkan sebelum perubahan besar |
| DNS | Panel Jagoan Hosting | Jangan klik Reset DNS Zone |

Urutan perubahan akses: SQL, edge function, baru frontend. Terbalik membuat `session` dan `claim` error.

## 8. Keputusan arsitektur (ADR singkat)

| # | Keputusan | Alasan |
|---|---|---|
| 1 | Gerbang di klaim ID, bukan di login | Satu pintu menjaga seluruh produk; login Privy tetap terbuka |
| 2 | Kode disimpan sebagai hash, sekali pakai | Kebocoran database tidak membocorkan kode |
| 3 | Akses disimpan di `beta_access`, terpisah dari `role` | `role` untuk wewenang (admin/tester), akses untuk gerbang beta |
| 4 | Landing dan dashboard dua project | Siklus deploy dan risiko terpisah |
| 5 | Pencatatan transaksi divalidasi on-chain di server | Klien tidak dipercaya |
| 6 | Tinjauan transaksi oleh aplikasi, bukan modal Privy | Satu konfirmasi; modal MFA Privy tetap dipakai untuk otorisasi |
| 7 | Passkey memakai UI Privy, bukan UI buatan sendiri | Alur WebAuthn/MFA sensitif; lebih aman memakai implementasi vendor |

## 9. Batasan dan utang teknis

1. RPC publik `sepolia.base.org` dengan batas permintaan; ganti dengan RPC sendiri sebelum wave 2.
2. Pencabutan tidak membekukan dana: penandatanganan di tangan pengguna (non-kustodial). Pagar server (intent, batas, saklar darurat) hanya mengikat aplikasi resmi.
3. Pengiriman kode masih manual; `send-invite` dijadwalkan setelah wave 1.
4. Status passkey belum terlihat di Settings (tombol tetap "Secure with passkey" setelah aktif).
5. Modal verifikasi Privy tampil dalam bahasa Inggris walau aplikasi berbahasa Indonesia **[Perlu dikonfirmasi apakah dapat dilokalkan]**.
6. Privy dalam mode development **[Perlu dikonfirmasi batas dan syarat production]**.
7. Tidak ada pemantauan error terpusat (hanya log Supabase dan Vercel).
