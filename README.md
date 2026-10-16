# Eazy_WhatsApp_Bot

Asisten WhatsApp mandiri untuk menyimpan catatan, membuat pengingat, dan memantau pesan pribadi serta grup dari terminal. Data disimpan di komputer sendiri dengan SQLite, tanpa server database terpisah.

## Yang tersedia

- Login QR melalui **Perangkat tertaut**, sesi tersimpan untuk penggunaan berikutnya.
- Perintah hanya dari nomor yang ditentukan di `.env`.
- Perintah grup memerlukan mention bot secara langsung; grup dapat dibatasi dengan daftar ID.
- Catatan, pencarian, dan pengingat satu kali yang terpisah untuk setiap chat.
- `/tag-semua` melalui kemampuan `@all` WhatsApp, dengan aktivasi eksplisit.
- Log pesan masuk pribadi dan grup di terminal serta berkas JSONL harian.
- Reconnect bertahap, antrean penyimpanan, dan penghentian melalui `Ctrl+C`.

Dibangun dengan [Baileys](https://github.com/WhiskeySockets/Baileys). Semua interaksi menggunakan perintah yang tercantum di bawah.

## Mulai cepat

Siapkan **Node.js 20.x mulai 20.9 atau Node.js 22 dan lebih baru** (Node.js 21 tidak didukung), npm, Git, koneksi internet, dan WhatsApp di ponsel. Jalankan dari PowerShell:

```powershell
git clone https://github.com/baysatriow/Eazy_WhatsApp_Bot.git
Set-Location .\Eazy_WhatsApp_Bot
npm install
Copy-Item -LiteralPath .env.example -Destination .env
notepad .env
```

Isi nomor **pengirim yang boleh memberi perintah**, dalam format internasional tanpa `+`, spasi, atau tanda baca:

```dotenv
BOT_ALLOWED_NUMBERS=6281234567890
```

Nomor di atas hanya ilustrasi. Gunakan nomor akun yang akan mengirim perintah ke akun bot. Pesan yang dikirim oleh akun bot sendiri tidak diproses. Untuk beberapa pengirim, pisahkan nomor dengan koma:

```dotenv
BOT_ALLOWED_NUMBERS=6281234567890,6289876543210
```

Lalu jalankan:

```powershell
npm start
```

1. Pindai QR dari **WhatsApp → Perangkat tertaut → Tautkan perangkat**.
2. Tunggu tulisan **WhatsApp terhubung. Menunggu pesan pribadi dan grup...**.
3. Dari nomor yang diizinkan, kirim `/bantuan` ke akun bot melalui chat pribadi.
4. Untuk grup, tambahkan akun bot dan kirim mention akun bot melalui pemilih kontak WhatsApp, diikuti `/bantuan`.

Biarkan proses berjalan untuk menerima pesan dan mengirim pengingat. `Ctrl+C` menghentikan bot sambil menyelesaikan pekerjaan penyimpanan yang sedang berjalan. Jalankan `npm start` lagi untuk menggunakan sesi yang masih valid. Restart bot setelah mengubah `.env`.

## Konfigurasi

| Variabel | Default | Fungsi |
| --- | --- | --- |
| `BOT_ALLOWED_NUMBERS` | kosong | Nomor pengirim yang boleh menjalankan perintah; dipisahkan koma. |
| `BOT_ALLOWED_GROUPS` | kosong | Opsional: ID grup yang boleh menerima perintah, dipisahkan koma. Kosong mengizinkan semua grup yang diikuti akun bot. |
| `BOT_TAG_ALL_ENABLED` | `false` | Mengaktifkan `/tag-semua` khusus grup. |
| `BOT_TIME_ZONE` | `Asia/Jakarta` | Zona IANA untuk input jadwal, tampilan waktu, dan tanggal log. |
| `BOT_DATABASE_PATH` | `data/eazy-whatsapp-bot.sqlite` | Lokasi SQLite; path relatif dihitung dari folder tempat proses dijalankan. |
| `BOT_LOG_INCOMING` | `true` | Catat pesan masuk ke terminal dan JSONL. Set `false` untuk mematikan keduanya. |

Nomor harus berisi 8–15 digit dan tidak diawali `0`. Daftar nomor kosong atau memiliki satu entri tidak valid menonaktifkan **seluruh perintah**. Daftar grup tidak kosong yang salah format menolak seluruh perintah grup. Perintah grup selalu memerlukan mention bot; syarat ini tidak dapat dimatikan melalui konfigurasi. `BOT_TAG_ALL_ENABLED` hanya aktif dengan nilai `true`, sedangkan log hanya mati dengan nilai `false`.

Contoh pembatasan grup:

```dotenv
BOT_ALLOWED_GROUPS=120363000000000000@g.us,120363111111111111@g.us
```

Ambil ID grup dari `chatId` di log saat ada pesan masuk. Identitas `@lid` adalah identitas internal WhatsApp, bukan nomor telepon untuk `.env`. Jika identitas pengirim tidak dapat dipetakan ke nomor yang diizinkan, bot tidak memproses perintahnya.

Pembatasan nomor dan grup berlaku untuk perintah. Saat log aktif, pesan baru dari pengirim lain tetap dicatat tanpa dibalas.

## Perintah

| Perintah | Hasil |
| --- | --- |
| `/bantuan` | Daftar perintah. |
| `/catat <teks>` | Simpan catatan dan terima ID. |
| `/catatan` | Lihat hingga 20 catatan terbaru di chat ini. |
| `/cari <kata>` | Cari teks catatan di chat ini, hingga 20 hasil terbaru. |
| `/hapus-catatan <id>` | Hapus catatan dengan ID tersebut di chat ini. |
| `/ingat YYYY-MM-DD HH:mm <pesan>` | Buat pengingat satu kali dengan waktu masa depan. |
| `/jadwal` | Lihat hingga 20 jadwal aktif terdekat di chat ini. |
| `/batal-jadwal <id>` | Batalkan jadwal dengan ID tersebut di chat ini. |
| `/tag-semua <pesan>` | Kirim `@all` di grup jika fitur diaktifkan dan tersedia. |

Teks catatan, pencarian, dan pesan pengingat/mention dibatasi 2.000 karakter. Balasan daftar dipotong agar tetap singkat; catatan yang tersimpan tetap utuh. Penghapusan dan pembatalan langsung dijalankan setelah ID valid diterima.

Contoh di chat pribadi:

```text
/catat Link dokumen rapat: https://example.com/rapat
/cari rapat
/ingat 2027-01-15 09:00 Rapat tim dimulai 15 menit lagi
/jadwal
/batal-jadwal 3
```

Contoh di grup, dengan **mention kontak bot yang benar-benar dipilih di WhatsApp**:

```text
@Bot /catat Keputusan rapat: kumpul Jumat pukul 19.00
@Bot /ingat 2027-01-15 18:30 Persiapan pertemuan malam ini
@Bot /tag-semua Pertemuan dimulai pukul 19.00
```

`@Bot` pada contoh adalah penanda, bukan teks literal yang perlu diketik. Mention dalam kutipan balasan tidak memenuhi syarat mention bot. Teks biasa dan perintah yang tidak dikenal tidak memicu tindakan.

Catatan dan jadwal mengikuti **chat asal**. Data chat pribadi tidak muncul di grup; satu grup tidak dapat membaca data grup lain. Semua nomor yang diizinkan dapat mengelola data pada chat yang sama. Pengingat dari grup dikirim kembali ke grup tersebut dan terlihat oleh anggota grup.

## Pengingat dan pemulihan

Waktu default adalah **Asia/Jakarta (WIB)**; timestamp disimpan dalam UTC. Gunakan format tanggal/jam persis seperti contoh. Waktu lampau, tanggal yang tidak valid, serta waktu yang ambigu atau tidak ada pada zona dengan pergantian jam ditolak.

Worker memeriksa jadwal sekitar setiap 15 detik ketika terhubung. Bot dan komputer/server harus tetap hidup; saat proses mati atau tidak terhubung, pengingat belum dapat dikirim. Jadwal yang sudah jatuh tempo sebelum proses mulai kembali atau terlambat lebih dari satu interval pemeriksaan dikirim dengan label **Pengingat terlambat**; jeda normal saat menunggu pemeriksaan berikutnya tidak diberi label terlambat. Jadwal yang terlambat hingga 24 jam dicoba, sedangkan jadwal yang lebih lama ditandai kedaluwarsa dan tidak dikirim. Pengiriman gagal dicoba kembali dengan jeda bertahap sampai batas kedaluwarsa.

Data jadwal disimpan sebelum bot mengirim konfirmasi. Status terkirim disimpan setelah pengiriman berhasil. Jika proses mati tepat setelah WhatsApp menerima pesan tetapi sebelum status tersimpan, pengingat dapat terkirim dua kali setelah pemulihan. Pembatalan tidak dapat menarik kembali pesan yang sudah dalam proses kirim. Jalankan satu proses bot untuk satu folder sesi/database.

## Mention semua anggota

Aktifkan bila diperlukan:

```dotenv
BOT_TAG_ALL_ENABLED=true
```

Kirim `/tag-semua <pesan>` dari nomor yang diizinkan di grup dengan mention bot. Bot menggunakan `mentionAll` Baileys. Ketersediaan `@all` bergantung pada akun/grup, peluncuran fitur WhatsApp, serta izin admin; jadikan akun bot admin jika grup mensyaratkannya. Jika pengiriman ditolak, bot mencoba melaporkan kegagalan di grup asal. Bot tidak menggantinya dengan daftar mention setiap anggota.

Keberhasilan permintaan kirim belum memastikan seluruh anggota menerima notifikasi. Pastikan perilakunya pada akun dan grup yang dipasangkan. Rujukan: [tipe pesan Baileys](https://github.com/WhiskeySockets/Baileys/blob/master/src/Types/Message.ts) dan [bantuan mention semua anggota WhatsApp](https://faq.whatsapp.com/521835819370205/).

## Membaca log

Contoh terminal dengan data ilustrasi:

```text
[08:30:12 WIB] [Pribadi] Raka (6281234567890@s.whatsapp.net): Halo!
[08:31:05 WIB] [Grup] Nisa (120363000000000000@g.us): Selamat pagi.
```

Log harian tersimpan sebagai `logs/incoming-YYYY-MM-DD.jsonl`, satu objek JSON per pesan. Tanggal nama berkas mengikuti `BOT_TIME_ZONE`. Kolomnya adalah `timestamp` (ISO UTC), `chatId`, `senderName`, `senderId`, `messageId`, `type`, dan `text`. Nama/identitas pengirim mengikuti data yang tersedia dari WhatsApp dan dapat menggunakan identitas internal.

Hanya pesan masuk baru dari event langsung yang dicatat. Pesan sendiri, status, siaran, channel, dan riwayat sinkronisasi dilewati. Media dicatat sebagai caption atau penanda seperti `[imageMessage]`; berkas media tidak diunduh. Terminal menampilkan pesan setelah penulisan log berhasil. Kegagalan logger tidak menghentikan pemrosesan perintah pada pesan tersebut; kegagalan perintah juga tidak menghentikan pencatatan.

Buka JSONL dengan editor teks, atau pantau satu berkas dari terminal kedua:

```powershell
Get-Content -LiteralPath .\logs\incoming-2027-01-15.jsonl -Tail 20 -Wait
```

Ganti tanggal sesuai berkas yang ada. Saat berganti hari, pantau berkas tanggal baru.

## Data lokal, privasi, dan backup

| Lokasi | Isi |
| --- | --- |
| `.env` | Nomor yang diizinkan dan konfigurasi lokal. |
| `auth_info_baileys/` | Kunci dan data sesi perangkat tertaut. |
| `data/` | Database catatan/jadwal, termasuk berkas SQLite `-wal`/`-shm` saat digunakan. |
| `logs/` | Isi pesan dan identitas chat/pengirim. |

Lokasi tersebut diabaikan oleh Git; `.env.example` tetap tersedia sebagai template. Jika memilih lokasi database di luar `data/`, tambahkan lokasi pribadi itu ke aturan ignore sebelum commit. Sesi, database, log, `.env`, dan QR adalah data pribadi. Batasi akses folder dan jangan unggah ke repository atau membagikan QR. Log tumbuh selama bot berjalan; atur pengarsipan atau penghapusan sesuai kebutuhan.

Untuk backup yang konsisten, hentikan bot dengan `Ctrl+C` dan tunggu proses selesai, lalu salin **seluruh folder `data/`** (atau folder database yang dikonfigurasi) ke tempat aman. Salin `logs/` jika perlu menyimpan riwayat log. Untuk memulihkan, hentikan bot, kembalikan folder database, pastikan `BOT_DATABASE_PATH` menunjuk ke file yang benar, lalu jalankan kembali. Jangan hanya menyalin file `.sqlite` saat bot masih berjalan karena perubahan bisa berada di berkas WAL.

Sesi bukan bagian dari backup catatan. Untuk memindahkan akun ke mesin lain, Anda dapat login ulang melalui QR; jika memindahkan folder sesi, perlakukan salinannya sebagai kunci akses akun dan hindari menjalankan dua proses bersamaan.

## Pemecahan masalah

- **Perintah tidak dibalas:** pastikan sudah terhubung, pengirim tercantum di `BOT_ALLOWED_NUMBERS`, format nomor benar, dan bot telah direstart setelah perubahan `.env`. Di grup, pilih mention kontak bot dan periksa `BOT_ALLOWED_GROUPS`. Pesan dari akun bot sendiri dilewati.
- **Pengingat belum masuk:** pastikan proses tetap hidup dan terhubung, periksa zona waktu serta `/jadwal`. Pengingat lebih dari 24 jam terlambat kedaluwarsa. Pengiriman ke WhatsApp tetap perlu koneksi dan akun yang valid.
- **QR/koneksi bermasalah:** gunakan QR terbaru. Reconnect memakai jeda bertahap hingga 30 detik. Hentikan lalu jalankan kembali bila diperlukan.
- **Sesi keluar:** hentikan bot, hapus folder `auth_info_baileys/` melalui File Explorer, lalu `npm start` dan pindai QR lagi. Untuk mencabut perangkat, gunakan menu Perangkat tertaut di ponsel.
- **Log/database gagal:** periksa ruang disk dan izin tulis. Pesan yang gagal ditulis ke log tidak otomatis diulang. Database yang gagal dibuka saat startup menghentikan proses.
- **Instalasi SQLite gagal:** gunakan Node yang didukung. Driver `better-sqlite3` menggunakan binary native; platform yang tidak memiliki binary siap pakai memerlukan toolchain build sesuai [panduan instalasinya](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md).
- **PowerShell memblokir `npm.ps1`:** gunakan `npm.cmd install` dan `npm.cmd start`.

## Batas penggunaan

Proyek ini tidak berafiliasi dengan WhatsApp. Koneksi, sesi, dan kemampuan grup bergantung pada layanan WhatsApp serta versi Baileys. Fitur yang tersedia tercantum pada tabel perintah; pengingat berulang, polling, dan moderasi anggota belum tersedia.

Login dan perilaku nyata perlu dipastikan pada akun yang Anda pasangkan: kirim pesan dari nomor yang diizinkan dan nomor lain, coba mention di grup, lalu buat pengingat singkat. Dokumentasi dan review kode tidak menggantikan verifikasi pengiriman langsung; seluruh contoh dalam README adalah ilustrasi.
