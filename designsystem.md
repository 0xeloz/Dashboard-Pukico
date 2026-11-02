# Design System Pukico Dashboard

**Status:** Token dan pola di bawah ini diambil langsung dari `src/index.css` dan komponen pada commit `c8d90ef`. Jika nilai di kode berubah, dokumen ini harus ikut berubah.

## 1. Arah desain

Jelas, tenang, praktis. Antarmuka finansial tidak perlu ramai untuk terasa modern. Prioritas informasi pada layar transfer:

1. Penerima dan identitas yang sudah di-resolve.
2. Nominal dan aset.
3. Jaringan aktif.
4. Rincian biaya dan total.
5. Status serta tindakan berikutnya.

Biaya dan jaringan tidak boleh disembunyikan di balik teks yang sulit ditemukan sebelum konfirmasi.

## 2. Token warna

Didefinisikan sebagai `@theme` Tailwind di `src/index.css`.

| Token | Nilai | Kegunaan |
| --- | --- | --- |
| `--color-primary` | `#0052FF` | Aksi utama, tautan, fokus, aksen |
| `--color-primary-hover` | `#0042D6` | Hover/pressed tombol utama |
| `--color-heading` | `#0A0B0D` | Judul dan teks utama |
| `--color-pukitext` | `#3B4455` | Teks isi |
| `--color-pukimuted` | `#5B6577` | Label sekunder, metadata |
| `--color-surface` | `#EEF4FF` | Latar aksen lembut, hover ikon |
| `--color-border-subtle` | `#E5E7EB` | Garis pemisah, border kartu |
| `--color-card` | `#FFFFFF` | Permukaan kartu dan sheet |

Latar halaman: `#F7F8FA`. Netral tambahan yang dipakai di komponen: `#F3F4F6` (isi abu), `#9CA3AF` (teks nonaktif), `#D1D5DB` (drag handle, border kuat), `#BFDBFE` (aksen pucat).

### Warna status

| Status | Teks | Latar | Border |
| --- | --- | --- | --- |
| Berhasil / lunas | `#047857` | `#ECFDF5` | — |
| Peringatan / fee tertunda | `#B45309` | `#FFFBEB` | `#FDE68A` |
| Gagal / belum dibayar | `#DC2626`, `#B91C1C` | `#FEF2F2` | — |

Warna tidak boleh menjadi satu-satunya pembeda status. Setiap status wajib punya label teks, dan idealnya ikon.

## 3. Tipografi

Font: **Plus Jakarta Sans** (`--font-sans`), fallback `system-ui`. Weight yang dipakai 400, 500, 600, 700.

| Peran | Ukuran | Catatan |
| --- | --- | --- |
| Label mikro | `10px`, `11px` | Badge, caption, label sheet |
| Sekunder | `text-xs` (12px) | Metadata, timestamp — ukuran paling sering dipakai |
| Isi | `text-sm` (14px) | Mayoritas teks UI |
| Judul | `text-base` (16px) ke atas | Judul layar dan nominal besar |

Aturan angka:

- Nominal memakai `tabular-nums` agar tidak bergeser saat berubah.
- Alamat dan hash memakai `font-mono` dan dipotong di tengah (`formatChecksum` + `chunkAddress`), bukan di akhir.
- Format angka mengikuti locale aktif (`id-ID` / `en-US`) lewat `fmt` di `i18n`.
- Nilai internal tidak pernah dibulatkan untuk perhitungan; pembulatan hanya di lapisan tampilan.

## 4. Radius dan bentuk

| Elemen | Radius |
| --- | --- |
| Kartu, panel | `rounded-2xl` / `rounded-xl` |
| Tombol dan pill | `rounded-full` |
| Bottom sheet | `rounded-t-[24px]`, `lg:rounded-[24px]` |
| Bottom nav mengambang | `rounded-[30px]` |
| Drag handle sheet | `rounded-full`, 36×4 px, warna `#D1D5DB` |

## 5. Layout dan kepadatan

- Shell: `max-w-[560px]` di mobile, `lg:max-w-[720px]`, `xl:max-w-[1040px]`, padding horizontal `px-4` (`xl:px-6`).
- Bottom nav mengambang: tinggi 60 px, `grid-cols-5`, `bottom-3`, dengan `.pb-safe` untuk safe-area iOS.
- Bottom sheet: `max-h-[85dvh]` (bisa dioverride, mis. `max-h-[92dvh]` saat review transfer).
- Konten di dalam sheet memakai `.sheet-body-pad` agar tidak tertutup home indicator.
- Layar kecil adalah acuan utama. Layout desktop hanya memperlebar, tidak menambah kepadatan.

## 6. Motion

Token durasi dan easing di `:root`:

```
--ease-out   cubic-bezier(0.22, 1, 0.36, 1)
--dur-tap    90ms    tekan tombol
--dur-fast   150ms   hover, transisi kecil
--dur-base   240ms   masuk tab, fade up
--dur-sheet  320ms   bottom sheet
```

Animasi bernama yang tersedia: `animate-sheet-in/out`, `animate-backdrop-in/out`, `animate-modal-in/out`, `tab-view-active`, `animate-balance-change`, `animate-fade-up`, `animate-popover-in`, `animate-fade-through`, `animate-checkmark-pop`, `animate-toast-in`, dan transisi bahasa `lang-content[data-phase]`.

Aturan:

- Gunakan animasi yang sudah ada; jangan menulis keyframes baru untuk satu layar.
- `prefers-reduced-motion: reduce` sudah ditangani global (durasi dipaksa ~0 dan transform dinonaktifkan). Jangan menambahkan animasi yang mengabaikan media query ini.
- Animasi tidak boleh menunda aksi pengguna; semua transisi bersifat kosmetik.

## 7. Komponen

| Komponen | Peran |
| --- | --- |
| `AppLayout` | Header, tab bar, kontainer konten |
| `BottomSheet` | Sheet dengan drag handle, backdrop, tutup, animasi masuk/keluar |
| `TxDetailsSheet` | Detail transaksi, status fee, tombol bayar fee, unduh/bagikan receipt |
| `ActivityRow` | Baris transaksi di beranda dan riwayat |
| `NotificationPanel` | Daftar notifikasi, tandai dibaca, hapus |
| `RecipientVerification` | Ringkasan penerima, peringatan alamat berubah atau mirip |
| `LanguagePopover` | Pemilih bahasa dengan transisi |
| `ToastViewport` | Antrean toast (info, success, warning, error, loading) |
| `SplashScreen` | Layar muat dan transisi selesai onboarding |
| `PukicoBrand` | Logo dan ikon aset (USDC, ETH, jaringan generik) |

Sebelum membuat komponen baru, cari yang sudah ada untuk tombol, sheet, toast, badge status, dan detail transaksi. Perluas yang ada daripada membuat pola baru.

## 8. Pola status dan uang

- Status transaksi ditampilkan sebagai pil berlabel teks: `Pending`, `Confirmed`, `Failed`, `Unpaid`, `Legacy`.
- Gaya sukses hanya untuk transaksi yang sudah confirmed, bukan untuk transaksi yang baru disiarkan.
- Fee tertunda mendapat blok peringatan dengan aksi `Pay now`, bukan error merah — transaksinya berhasil, hanya biayanya belum terbayar.
- Jangan mencampur USDC dan ETH menjadi satu total. Gas selalu disebut dalam ETH.
- Estimasi selalu diberi label estimasi.

## 9. Formulir

- Label terlihat, bukan hanya placeholder.
- Validasi tampil dekat field terkait, bukan hanya di toast.
- Input dipertahankan saat error yang masih bisa dipulihkan.
- Tombol submit dinonaktifkan selama permintaan berjalan untuk mencegah pengiriman ganda.
- Nominal memakai `inputMode="decimal"` dan divalidasi ke unit integer sebelum dipakai.

## 10. Copy dan bahasa

Dua bahasa: `en` dan `id`, dipilih dari `localStorage` (`pukico.lang`) atau `navigator.language`, dengan transisi fade 120 ms keluar → 280 ms masuk.

- Semua teks UI berasal dari `src/i18n/en.ts` dan `id.ts`. Jangan menulis string bahasa langsung di komponen.
- Nada bahasa Indonesia: singkat, langsung, tanpa istilah internal. `Kirim`, `Terima`, `Riwayat`, `Teman`, `Pengaturan`.
- Tombol memakai kata kerja spesifik: `Review transfer` sebelum konfirmasi, `Confirm` hanya untuk persetujuan nyata, `Cancel` untuk membatalkan tindakan yang belum dijalankan.
- Jangan memakai kata "berhasil" sebelum status terverifikasi.

## 11. Aksesibilitas

- `:focus-visible` global: outline 2 px `#0052FF`, offset 2 px.
- Tab yang tidak aktif diberi `inert` sehingga tidak bisa difokus keyboard atau dibaca screen reader.
- Semua kontrol ikon punya `aria-label`; ada ±80 atribut `aria-*` di kode.
- Status tidak boleh bergantung pada warna saja.
- Sheet dapat ditutup lewat backdrop, tombol tutup, dan tombol Escape.
- Jangan menaruh informasi penting hanya pada hover.
- Uji overflow pada alamat, hash, dan nominal di layar sempit.

## 12. Yang tidak boleh dilakukan

- Menambah library UI baru untuk satu layar.
- Mengubah token global demi kebutuhan satu fitur.
- Menampilkan angka biaya yang belum tersedia sebagai angka pasti.
- Menampilkan data contoh tanpa penanda sebagai data nyata.
- Menggunakan float untuk menghitung nominal token.
- Membuat tombol aksi yang langsung memindahkan dana tanpa langkah review.
