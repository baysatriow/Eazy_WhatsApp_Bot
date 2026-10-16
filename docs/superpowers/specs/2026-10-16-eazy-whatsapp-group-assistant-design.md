# Eazy WhatsApp Group Assistant

**Tanggal:** 2026-10-16  
**Status:** Draft, menunggu persetujuan pemilik proyek

## Tujuan

Kembangkan `Eazy_WhatsApp_Bot` dari pencatat pesan menjadi asisten WhatsApp pribadi yang dapat dipakai di chat langsung dan grup. Hanya nomor yang dikonfigurasi pemilik yang boleh menjalankan perintah bot. Bot tetap mencatat pesan masuk pribadi dan grup seperti sekarang.

## Kebutuhan yang sudah ditetapkan

- Konfigurasi lokal disimpan di `.env`; contoh konfigurasi yang aman disediakan di `.env.example`.
- Nomor yang diizinkan harus dinyatakan eksplisit. Jika konfigurasi nomor kosong atau tidak valid, bot tidak menjalankan perintah apa pun.
- Perintah di grup hanya diproses jika pengirim termasuk nomor yang diizinkan dan menyebut bot secara eksplisit.
- Pesan dari pengirim lain tetap dicatat oleh logger, tetapi bot diam: tidak membalas dan tidak menjalankan tindakan.
- Data catatan dan jadwal disimpan dalam basis data ringan yang persisten di disk lokal.
- Waktu jadwal menggunakan `Asia/Jakarta`; data waktu disimpan dalam UTC.
- Nomor telepon dinormalisasi sebelum dibandingkan. Jika pesan grup hanya memiliki identitas LID yang tidak dapat dipetakan ke nomor yang diizinkan, bot menolak perintah.
- Login QR tetap dilakukan oleh pemilik proyek. Implementasi tidak membuka atau memindai akun WhatsApp.

## Rancangan fitur

### Tahap inti

1. **Bantuan dan akses**
   - Perintah `/bantuan` menampilkan perintah yang didukung.
   - `BOT_ALLOWED_NUMBERS` menerima daftar nomor format internasional tanpa tanda `+`, dipisahkan koma.
   - Default konfigurasi kosong bersifat fail-closed; logger tetap berjalan, tetapi tidak ada perintah yang dieksekusi.
   - Chat langsung dari nomor yang diizinkan boleh memakai perintah dengan awalan `/`.
   - Di grup, nomor yang diizinkan harus menyebut akun bot dan menyertakan perintah.

2. **Catatan**
   - `/catat <teks>` menyimpan catatan dengan ID yang dapat dirujuk.
   - `/catatan` menampilkan catatan dalam cakupan chat saat ini.
  - `/cari <kata>` hanya mencari dalam cakupan chat saat ini; pencarian grup tidak pernah mencakup catatan pribadi.
  - `/hapus-catatan <id>` menghapus catatan yang tepat berdasarkan ID dan langsung mengirim tanda terima.
   - Catatan pribadi hanya dapat dibaca di chat langsung. Catatan yang dibuat di grup terpisah per grup dan hasilnya terlihat di grup itu.

3. **Pengingat dan jadwal**
   - `/ingat YYYY-MM-DD HH:mm <pesan>` membuat pengingat satu kali, menggunakan WIB.
   - `/jadwal` menampilkan jadwal yang belum selesai untuk chat tersebut.
  - `/batal-jadwal <id>` membatalkan jadwal yang tepat berdasarkan ID dan langsung mengirim tanda terima.
   - Pengingat yang dibuat di grup akan dikirim kembali ke grup tersebut; pengingat chat langsung dikirim ke chat pribadi.
   - Jadwal disimpan sebelum bot mengirim konfirmasi. Setelah proses dimulai kembali, jadwal yang terlambat sampai 24 jam dikirim sekali dengan label terlambat; jadwal yang lebih lama ditandai kedaluwarsa.
- Waktu pengingat harus berada di masa depan saat perintah dibuat; waktu lampau ditolak dan tidak pernah langsung dikirim sebagai pengingat.
- Pengiriman menggunakan semantik at-least-once: pekerjaan due yang statusnya belum tersimpan sebagai terkirim akan dicoba lagi saat proses hidup. Jika proses mati setelah WhatsApp menerima pesan tetapi sebelum status terkirim dicatat, penerima dapat melihat duplikat; memilih retry mengurangi risiko pengingat hilang.
   - Bot harus terhubung saat waktu pengiriman. Database mencegah jadwal hilang karena restart, tetapi tidak dapat mengirim ketika mesin atau proses benar-benar mati.

4. **Mention semua anggota**
   - `/tag-semua <pesan>` hanya tersedia di grup, hanya untuk nomor yang diizinkan, dan memerlukan `BOT_TAG_ALL_ENABLED=true`.
   - Bot memakai kemampuan `mentionAll` Baileys, bukan mengirim daftar mention individu secara diam-diam.
   - Di grup besar, akun WhatsApp yang dipasangkan ke bot harus menjadi admin agar permintaan @all memenuhi batas WhatsApp. Jika WhatsApp menolak atau fitur belum tersedia untuk akun/grup, bot memberi laporan gagal kepada pemilik tanpa mengirim fallback massal.
  - Laporan gagal @all dibalas pada grup asal agar pemilik langsung melihat status perintah yang baru ia kirim.
   - Setelan ini mati secara default untuk mencegah mention massal yang tidak sengaja.

### Kandidat tahap lanjutan

- Polling/voting untuk menentukan waktu atau pilihan kegiatan.
- Agenda mingguan dan pengingat berulang harian/mingguan.
- Daftar tugas grup dengan status belum selesai/selesai.
- Ekspor catatan dan agenda ke Markdown/CSV.
- Perintah percakapan bebas untuk membuat catatan atau jadwal. Jika kelak ditambahkan, hanya pesan yang diizinkan dan ditujukan ke bot yang boleh diproses; pesan grup lain tidak dikirim otomatis ke layanan luar.

## Konfigurasi yang diusulkan

`.env.example` memuat setelan tanpa rahasia dan `.env` dimasukkan ke `.gitignore`.

```dotenv
BOT_ALLOWED_NUMBERS=
BOT_ALLOWED_GROUPS=
BOT_GROUP_REQUIRE_MENTION=true
BOT_TAG_ALL_ENABLED=false
BOT_TIME_ZONE=Asia/Jakarta
BOT_DATABASE_PATH=data/eazy-whatsapp-bot.sqlite
BOT_LOG_INCOMING=true
```

`BOT_ALLOWED_GROUPS` opsional. Jika kosong, nomor yang diizinkan dapat memakai bot di grup mana pun yang diikuti akun tertaut, tetap dengan syarat mention. Jika diisi, perintah grup dibatasi ke ID grup yang dicantumkan. `BOT_LOG_INCOMING=true` mempertahankan fungsi logger saat ini; mematikan bot command tidak mematikan pencatatan pesan.

## Penyimpanan

Gunakan satu berkas SQLite lokal di `data/eazy-whatsapp-bot.sqlite`, tanpa server basis data terpisah. Driver SQLite dipilih agar mendukung Node 20.9 dan Node 22 yang saat ini dicantumkan proyek; tabel catatan, jadwal, dan status pengiriman dibuat dengan migrasi kecil saat startup. Folder `data/` dan semua berkas `.env` dikecualikan dari Git.

Jadwal dan catatan tetap berada di komputer/server tempat bot berjalan. Memindahkan proyek tanpa menyalin berkas basis data tidak memindahkan data. README menjelaskan lokasi data, pencadangan, dan larangan mengunggah `.env`, sesi, log, atau database pribadi.

## Batas penggunaan

- Bot bukan salinan penuh aplikasi WhatsApp. Fitur grup akan ditambah bertahap sesuai kemampuan Baileys dan izin WhatsApp.
- WhatsApp menyatakan fitur mention `@all` masih dibangun/diuji dan belum tersedia untuk semua akun. WhatsApp juga membatasi siapa yang dapat memakai mention semua anggota menurut ukuran grup. Ketersediaannya harus diverifikasi pada akun yang dipasangkan.
- Aplikasi saat ini adalah logger baca-saja. Implementasi baru akan menambahkan pengiriman pesan hanya sebagai respons atas perintah eksplisit dari nomor yang diizinkan.
- Tidak ada auto-moderasi, penghapusan pesan anggota, undangan anggota, atau balasan otomatis ke seluruh percakapan pada tahap inti.

## Kriteria penerimaan untuk tahap inti

1. `.env.example` menunjukkan cara mengizinkan satu atau beberapa nomor tanpa menyimpan nomor nyata di Git; `.env` dan `data/` diabaikan Git.
2. Jika nomor yang diizinkan tidak dikonfigurasi, tidak ada pesan yang dibalas atau tindakan bot dijalankan.
3. Pesan dari nomor yang tidak diizinkan tetap masuk log, tetapi tidak pernah memicu balasan, akses catatan, jadwal, atau mention.
4. Perintah chat langsung dari nomor yang diizinkan dapat menyimpan/mencari/menghapus catatan dan membuat/menampilkan/membatalkan pengingat.
5. Perintah grup memerlukan nomor yang diizinkan dan mention bot; data jadwal/catatan grup tidak bercampur dengan chat langsung atau grup lain.
6. Data bertahan saat proses dimulai ulang; pengingat due diproses sesuai aturan pemulihan yang tertulis di atas.
7. `@all` default mati, hanya aktif setelah konfigurasi eksplisit, dibatasi ke grup, dan kegagalan dukungan WhatsApp tidak memicu fallback massal.
8. Log JSONL saat ini tetap berfungsi untuk pesan pribadi dan grup.
9. README menjelaskan setup `.env`, perintah, batas `@all`, database, backup, QR login, dan fakta bahwa server harus hidup pada waktu pengingat.

## Pilihan implementasi

Gunakan berkas SQLite dan driver yang kompatibel dengan rentang Node proyek agar tetap ringan tanpa layanan database. `better-sqlite3` menyediakan prebuilt binaries pada platform umum dan mendukung Node 20/22 pada lini v12; `node:sqlite` tidak memerlukan dependensi tambahan tetapi masih ditandai eksperimental pada Node 22.23.3. Rancangan ini memilih driver SQLite terpelihara yang kompatibel dengan Node 20.9/22, bukan API eksperimen bawaan.

## Keputusan kasus tepi

- Jadwal memakai at-least-once: lebih baik ada kemungkinan duplikat sempit setelah crash daripada menghilangkan pengingat yang belum tercatat terkirim.
- Pencarian catatan mengikuti batas privasi yang sama dengan daftar catatan: hanya chat saat ini.
- Penghapusan dan pembatalan memerlukan ID eksplisit; tindakan langsung dijalankan dan hasilnya dikonfirmasi lewat balasan.
- Waktu pengingat lampau ditolak, bukan dikirim segera.
- Kegagalan @all dijelaskan di grup asal dan tidak diikuti tag massal satu per satu.

## Referensi

- [Panduan Baileys mengirim pesan dan mention](https://github.com/WhiskeySockets/docs/blob/main/messaging/sending-messages.mdx)
- [Tipe `mentionAll` pada Baileys](https://github.com/WhiskeySockets/Baileys/blob/master/src/Types/Message.ts)
- [Batas dan ketersediaan mention `@all` WhatsApp](https://faq.whatsapp.com/521835819370205/?cms_platform=web&locale=ml_IN)
- [Dokumentasi Node.js v22.23.3 untuk SQLite](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html)
- [Metadata `better-sqlite3` v12.4.1](https://github.com/WiseLibs/better-sqlite3/blob/v12.4.1/package.json)
