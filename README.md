# Eazy_WhatsApp_Bot

Pantau pesan WhatsApp pribadi dan grup langsung dari terminal, dengan log harian yang tersimpan di komputer sendiri.

## Fitur

- Login dengan QR dari menu **Perangkat tertaut** WhatsApp.
- Tampilkan pesan masuk beserta waktu WIB, pengirim, dan identitas chat.
- Simpan setiap pesan dalam format JSONL, satu pesan per baris.
- Gunakan kembali sesi login saat aplikasi dijalankan berikutnya.
- Sambungkan kembali koneksi yang terputus dengan jeda bertahap.
- Hentikan aplikasi dengan `Ctrl+C` sambil menyelesaikan penulisan log.

Proyek ini menggunakan [Baileys](https://github.com/WhiskeySockets/Baileys). Cakupannya saat ini adalah mencatat pesan masuk: aplikasi tidak membalas pesan, mengunduh media, atau memutar ulang riwayat chat.

## Persiapan

Siapkan **Node.js 20.x mulai 20.9, atau Node.js 22 dan lebih baru (Node.js 21 tidak didukung)**, npm, Git, koneksi internet, dan WhatsApp di ponsel untuk memindai QR. Node.js dapat diunduh dari [nodejs.org](https://nodejs.org/).

Periksa versi di PowerShell:

```powershell
node --version
npm --version
```

## Instalasi dan login

Jalankan di PowerShell:

```powershell
git clone https://github.com/baysatriow/Eazy_WhatsApp_Bot.git
Set-Location .\Eazy_WhatsApp_Bot
npm install
npm start
```

Jika memakai folder proyek yang sudah tersedia, buka PowerShell di folder tersebut lalu jalankan `npm install` dan `npm start`.

1. Tunggu QR muncul di terminal.
2. Di ponsel, buka **WhatsApp → Perangkat tertaut → Tautkan perangkat**.
3. Pindai QR yang ditampilkan.
4. Tunggu pesan **WhatsApp terhubung. Menunggu pesan pribadi dan grup...**.
5. Kirim pesan dari akun lain ke chat pribadi dan grup yang diikuti akun tertaut. Pesan baru akan muncul di terminal dan disimpan dalam log.

Biarkan terminal terbuka selama ingin memantau chat. Tekan `Ctrl+C` untuk berhenti. Pada penggunaan berikutnya, jalankan `npm start` dari folder proyek; sesi yang masih valid akan digunakan kembali tanpa memindai QR.

## Membaca log

Contoh tampilan terminal dengan data ilustrasi:

```text
[08:30:12 WIB] [Pribadi] Raka (6281234567890@s.whatsapp.net): Halo!
[08:31:05 WIB] [Grup] Nisa (120363000000000000@g.us): Selamat pagi.
```

Identitas chat mengikuti format Baileys. Chat pribadi dapat memakai nomor telepon atau identitas internal WhatsApp; nama pengirim bergantung pada informasi yang tersedia dari pesan.

Log tersimpan otomatis dalam folder `logs/` di folder proyek:

```text
logs/
└── incoming-2026-10-15.jsonl
```

Nama berkas mengikuti tanggal pesan dalam zona **Asia/Jakarta (WIB)**. Setiap baris JSON memuat:

| Kolom | Isi |
| --- | --- |
| `timestamp` | Waktu pesan dalam ISO 8601 UTC; waktu penerimaan lokal digunakan jika waktu pesan tidak tersedia. |
| `chatId` | Identitas chat pribadi atau grup. |
| `senderName` | Nama pengirim jika tersedia. |
| `senderId` | Identitas pengirim; dapat bernilai `null` jika pengirim grup tidak tersedia. |
| `messageId` | Identitas pesan jika tersedia. |
| `type` | Jenis pesan, misalnya `conversation` atau `imageMessage`. |
| `text` | Isi teks, caption media, atau penanda jenis seperti `[imageMessage]`. |

Buka berkas JSONL dengan editor teks, atau pantau berkas hari ini melalui PowerShell di terminal kedua:

```powershell
$wibZone = [System.TimeZoneInfo]::FindSystemTimeZoneById('SE Asia Standard Time')
$wibDate = [System.TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $wibZone).ToString('yyyy-MM-dd')
Get-Content -LiteralPath ".\logs\incoming-$wibDate.jsonl" -Tail 20 -Wait
```

Berkas baru dibuat setelah ada pesan masuk yang berhasil disimpan. Saat berganti hari, jalankan kembali perintah di atas untuk memantau berkas tanggal baru.

## Data lokal dan privasi

| Folder | Fungsi |
| --- | --- |
| `auth_info_baileys/` | Menyimpan kunci dan data sesi perangkat tertaut. |
| `logs/` | Menyimpan isi pesan masuk dan identitas chat/pengirim. |
| `node_modules/` | Menyimpan dependensi aplikasi. |

Ketiga folder tersebut diabaikan oleh Git. Kunci sesi, isi chat, dan QR login adalah data pribadi; simpan di komputer yang aksesnya dapat Anda kendalikan. Jangan unggah folder sesi atau log ke repository, dan jangan membagikan QR login.

## Pemecahan masalah

### QR belum muncul atau koneksi terputus

Pastikan koneksi internet tersedia. Aplikasi mencoba menyambungkan kembali dengan jeda bertahap hingga 30 detik. QR dapat berganti selama menunggu; gunakan QR terbaru. Jika tetap gagal, hentikan dengan `Ctrl+C`, lalu jalankan `npm start` lagi.

### Sesi keluar atau perlu login ulang

Jika terminal menampilkan **Sesi WhatsApp keluar**, hentikan aplikasi. Dari folder proyek, hapus sesi lokal lalu mulai kembali:

```powershell
Remove-Item -LiteralPath .\auth_info_baileys -Recurse -Force
npm start
```

Perintah tersebut menghapus kunci sesi lokal sehingga Anda perlu memindai QR kembali. Log yang sudah tersimpan tetap tersedia. Untuk mencabut akses perangkat, gunakan menu **Perangkat tertaut** di ponsel.

### Pesan tidak muncul

Pastikan status sudah terhubung dan kirim pesan **baru dari akun lain**. Aplikasi hanya mencatat pesan masuk pribadi dan grup; pesan yang dikirim sendiri, status, siaran, channel, dan riwayat sinkronisasi tidak dicatat. Media ditampilkan sebagai caption atau penanda jenis tanpa mengunduh berkas.

### Log gagal disimpan

Periksa ruang disk serta izin tulis folder proyek. Terminal hanya menampilkan pesan setelah penulisan log berhasil. Jika penyimpanan gagal, aplikasi menampilkan pemberitahuan; pesan yang gagal disimpan tidak otomatis dicoba ulang.

### PowerShell menolak menjalankan npm

Jika `npm.ps1` diblokir oleh kebijakan PowerShell, gunakan `npm.cmd install` dan `npm.cmd start` untuk menjalankan npm.

## Batas penggunaan

Baileys menghubungkan aplikasi sebagai perangkat tertaut WhatsApp. Proyek ini tidak berafiliasi dengan WhatsApp. Sesi bisa kedaluwarsa atau dicabut dari ponsel, dan koneksi bergantung pada layanan WhatsApp serta versi Baileys yang digunakan.

Penerimaan pesan pribadi dan grup secara langsung baru dapat dipastikan setelah Anda memindai QR dan mengirim pesan ke akun tertaut. Contoh log di README ini adalah ilustrasi.
