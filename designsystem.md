# Pukico: Design System

Versi: 0.1 · Sumber: `src/index.css`, komponen di `src/components`, dan tampilan yang berjalan. Nilai di bawah adalah yang dipakai di kode saat ini; bagian bertanda **[Usulan]** belum ada di kode.

## 1. Prinsip

1. **Jelas sebelum cantik.** Setiap layar menjawab satu pertanyaan: kirim ke siapa, berapa, apa statusnya.
2. **Jujur.** Jangan menyembunyikan batasan: label "Testnet", "No monetary value", dan status "masih dicek" ditampilkan apa adanya.
3. **Mobile dulu.** Dirancang untuk lebar sekitar 380 px; satu tangan, ibu jari mencapai aksi utama.
4. **Tenang untuk soal uang.** Warna ramai hanya untuk aksi utama; peringatan memakai amber, bukan merah, kecuali bahaya sungguhan.
5. **Satu konfirmasi bermakna.** Satu layar tinjauan yang lengkap, lalu otorisasi (passkey), bukan beberapa layar yang mengulang.

## 2. Warna

### Token (dari `@theme`)

| Token | Hex | Pemakaian |
|---|---|---|
| `--color-primary` | `#0052FF` | Aksi utama, tautan, fokus, kartu saldo |
| `--color-primary-hover` | `#0042D6` | Hover/tekan tombol utama |
| `--color-heading` | `#0A0B0D` | Judul, angka penting |
| `--color-pukitext` | `#3B4455` | Teks isi |
| `--color-pukimuted` | `#5B6577` | Teks sekunder, label |
| `--color-surface` | `#EEF4FF` | Latar lembut berwarna biru (ikon, kartu info) |
| `--color-border-subtle` | `#E5E7EB` | Garis pemisah, batas kartu |
| `--color-card` | `#FFFFFF` | Kartu, sheet |
| (body) | `#F7F8FA` | Latar halaman dashboard |
| (netral) | `#F3F4F6` | Latar tombol sekunder, chip |
| (landing body) | `#FFFFFF` | Latar halaman landing |

### Warna status

| Makna | Teks | Latar | Batas |
|---|---|---|---|
| Sukses / confirmed | `#047857` | hijau muda | - |
| Peringatan / akses tidak aktif | `#B45309` | `#FFFBEB` | `#FDE68A` |
| Bahaya / gagal | `#DC2626` dan `#B91C1C` | merah muda | - |
| Info / pending | `#0052FF` | `#EEF4FF` | - |

Aturan: kontras teks di atas latar harus tetap terbaca; jangan memakai warna sebagai satu-satunya penanda status (sertakan ikon atau kata).

## 3. Tipografi

- Font: **Plus Jakarta Sans**, cadangan `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`.
- Antialiasing aktif (`-webkit-font-smoothing: antialiased`).
- Warna judul `#0A0B0D`; isi `#3B4455`; sekunder `#5B6577`.
- Angka dan alamat/kode memakai font monospace (saldo, hash, Pukico ID, kode akses).
- **[Usulan]** Skala: judul layar 24-28 px / 700; judul bagian 18-20 px / 700; isi 15-16 px / 400-500; keterangan 12-14 px.

## 4. Bentuk, jarak, bayangan

- Radius: terbanyak `rounded-full` (tombol, chip), lalu `rounded-2xl` (kartu, sheet), `rounded-xl`, `rounded-lg`.
- Jarak berbasis kelipatan 4 px (kelas Tailwind bawaan).
- Area aman perangkat: `.pb-safe` dan `.sheet-body-pad` untuk bilah bawah dan sheet.
- Bayangan dipakai hemat, hanya untuk elemen melayang (sheet, navigasi bawah).
- Garis pemisah memakai `border-subtle`, bukan bayangan.

## 5. Gerak

| Token | Nilai | Pemakaian |
|---|---|---|
| `--dur-tap` | 90 ms | Umpan tekan |
| `--dur-fast` | 150 ms | Hover, perubahan kecil |
| `--dur-base` | 240 ms | Transisi tab (`tabEnter`) |
| `--dur-sheet` | 320 ms | Sheet naik/turun |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Masuk |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Keluar/dua arah |

Animasi yang ada: masuk tab (`tabEnter`), perubahan saldo (`balanceChange`). Hormati `prefers-reduced-motion` **[Usulan: belum dicek di kode]**.

## 6. Navigasi dan tata letak

Bilah bawah melayang dengan 5 tujuan: **Home**, **Friends**, tombol tengah **Discover** (tombol bulat biru; saat ini "Coming soon"), **History**, **Settings**. Header atas: chip Pukico ID (dengan salin), lencana **Testnet**, lonceng notifikasi. Halaman Receive dan Dev dibuka dari konteks, bukan dari bilah.

## 7. Komponen

| Komponen | File | Catatan |
|---|---|---|
| Kartu saldo | `HomeView` | Latar `#0052FF`, saldo besar, "No monetary value", biaya ETH |
| Tombol aksi bulat | `HomeView` | Send, Receive, Get test USDC; Send nonaktif saat akses tidak aktif |
| Bottom sheet | `ui/BottomSheet.tsx` | Send, Receive, faucet, detail transaksi |
| Baris aktivitas | `ui/ActivityRow.tsx` | Arah, penerima/pengirim, jumlah, status |
| Detail transaksi | `ui/TxDetailsSheet.tsx` | Hash, Basescan, status |
| Panel notifikasi | `ui/NotificationPanel.tsx` | Daftar dan tandai dibaca |
| Pemilih bahasa | `ui/LanguagePopover.tsx` | English/Indonesia |
| Splash dan merek | `ui/SplashScreen.tsx`, `ui/PukicoBrand.tsx` | Logo `pukico-logo.png` |
| Banner peringatan | `HomeView`, `FriendsView`, `SendSheetContent` | Amber, ikon peringatan |
| Layar kode akses | `views/AccessCodeView.tsx` | Satu input, tombol utama penuh lebar |
| Onboarding klaim ID | `views/OnboardingView.tsx` | |

## 8. Pola interaksi

**Alur kirim (tujuh langkah sebelum tanda tangan):** pilih penerima, jumlah, tinjau, setujui (passkey bila aktif), menunggu konfirmasi, hasil. Hasil memiliki empat keadaan: **confirmed**, **failed**, **timeout** ("Sent. We're still checking it."), **no_access**.

**Aturan layar tinjauan:** tampilkan Pukico ID penerima, jumlah dan aset, jaringan (Base Sepolia, Testnet), perkiraan biaya. **[Usulan]** tambahkan bagian "Details" berisi alamat penerima lengkap dan kontrak token untuk pengguna lanjut.

**Keadaan kosong, memuat, galat:** setiap daftar punya tiga keadaan. Galat berisi apa yang terjadi dan apa langkah berikutnya, tanpa menyalahkan pengguna.

**Passkey:** pendaftaran di Settings, modal verifikasi memakai UI Privy (tema terang, aksen `#0052FF`, logo `pukico-logo.png`). **[Usulan]** setelah aktif, tombol berubah menjadi status "Passkey aktif" dengan tombol "Kelola".

## 9. Suara dan teks

- Ringkas, ramah, jujur. Bahasa Inggris sebagai bawaan UI; Indonesia tersedia penuh.
- Gunakan istilah yang konsisten: **Pukico ID** (bukan username/handle), **access code**, **testnet**.
- Pesan galat: sebutkan penyebab dan langkah (contoh: "Kode ini sudah dipakai." / "Terlalu banyak percobaan. Coba lagi 15 menit lagi.").
- Jangan menjanjikan hal yang belum ada (hindari "instan", "tanpa biaya").
- Semua teks lewat `i18n/en.ts` dan `i18n/id.ts`; tidak ada string di komponen.

## 10. Aksesibilitas

- Fokus: `outline: 2px solid #0052FF; outline-offset: 2px`.
- Target sentuh minimal 44 x 44 px untuk tombol utama.
- Teks bantu tidak boleh hanya berupa warna.
- **[Usulan]** label ARIA pada tombol ikon, ukuran teks dapat membesar, uji dengan pembaca layar.

## 11. Email

Sederhana: banner biru di atas, teks polos, kode di baris sendiri dengan font monospace tebal, tautan biasa, tanda tangan tim. Pengirim `Pukico Team <hello@pukico.xyz>`. Tanpa lampiran gambar (banner disisipkan sebaris atau di-host). Bahasa Inggris untuk wave ini.

## 12. Landing

Memakai token yang sama (font, `#0052FF`, `#0A0B0D`, `#3B4455`, `#5B6577`, `#EEF4FF`) dengan latar putih. Lencana **Closed Beta**, tombol utama "Join the waitlist", tautan sekunder "Have a code? Sign in" ke `https://app.pukico.xyz`. Bagian: Hero, Why, Differentiator, How it works, Product preview, Honest, FAQ, Waitlist, Footer.

## 13. Keputusan: modal tanda tangan

**Pakai tinjauan buatan sendiri + modal MFA Privy.** Tinjauan Pukico menjelaskan *apa* yang dikirim dengan bahasa produk; modal Privy menangani *siapa yang mengizinkan* (passkey). Jangan membuat UI passkey sendiri: alurnya sensitif dan sudah dipelihara vendor. Evaluasi ulang sebelum mainnet (lihat `security.md`, risiko 7).
