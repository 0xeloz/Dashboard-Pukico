# Pukico.xyz - Spesifikasi Keamanan

## 1. VISI & KONSEP PRODUK

Pukico adalah wallet non-custodial yang memungkinkan pengguna mengirim dan menerima crypto menggunakan Pukico ID (contoh: @andika) alih-alih alamat panjang.

**Prinsip Utama:**

* User fully controls private keys (self-custody).
* Pengalaman sesederhana mengirim pesan ke teman.
* Keamanan tidak boleh dikorbankan demi kemudahan.
* Selalu tampilkan alamat asli + simulasi transaksi sebelum dikirim.

## 2. THREAT MODEL & PERSYARATAN KEAMANAN

**Ancaman yang harus ditangani:**

* Kebocoran atau eksfiltrasi private key / seed
* Phishing & social engineering
* Salah alamat / network salah
* Malicious signing (EIP-7702 delegation, unlimited approve)
* Kompromi signing infrastructure
* Clipboard malware

**Persyaratan Non-Negotiable:**

* Private key / seed TIDAK PERNAH dikirim ke server Pukico atau AI.
* Setiap transaksi wajib melewati preview + konfirmasi eksplisit user.
* Resolusi @username harus diverifikasi dan ditampilkan alamat penuhnya.
* Mendukung passkey + opsi seed phrase backup offline.
* Open-source bagian kritis + audit sebelum mainnet.

## 3. ARSITEKTUR KEAMANAN YANG DIREKOMENDASIKAN

### Key Management:

* Generate key on-device dengan entropi kuat.
* Simpan di Secure Enclave / StrongBox / encrypted local storage.
* Passkey (WebAuthn) sebagai opsi utama.
* Optional BIP39 seed phrase untuk backup manual.

### Username System:

* User claim @id dengan menandatangani pesan.
* Binding username ↔ address diverifikasi (on-chain atau hybrid).
* Saat mengirim selalu tampilkan alamat lengkap + checksum.

### Transaction Flow:

* Resolve username → simulasi transaksi → tampilkan detail (alamat, jumlah, fee, network, efek) → user approve → sign → broadcast.
* Hard warning untuk EIP-7702, unlimited approval, kontrak tidak dikenal, dan network berbeda.

## 4. ROADMAP & TASK LIST

### Fase 1: Foundation (Prioritas Tertinggi)

* Tulis Threat Model lengkap
* Finalisasi tech stack (Frontend, chain, key management, username registry)
* Setup repository + environment Base Sepolia
* Buat dokumen arsitektur (key flow + send flow)

### Fase 2: Core Wallet

* Implementasi create/import wallet + passkey
* Enkripsi local storage
* Balance check & receive address
* Username claim + resolution system

### Fase 3: Send Feature Aman

* Flow send ke @username dengan preview alamat penuh
* Transaction simulation & confirmation screen
* Network selection & gas estimation
* Friends list

### Fase 4: Security Hardening

* Warning EIP-7702 & unlimited approvals
* Visual address verification
* Optional spending limit & time-lock
* Security logging

### Fase 5: Testing & Polish

* Unit + integration tests
* Manual red-team testing
* UI/UX polish
* Closed beta di testnet

### Fase 6: Audit & Mainnet

* Security audit (key handling + username contract)
* Perbaikan findings
* Deploy mainnet (Base)
* Monitoring & incident response plan

### Fase 7: Post-Launch

* Multi-chain expansion
* Fitur tambahan (swap, NFT, social recovery)
* Continuous security updates
