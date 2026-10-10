# ALAM HIKMAH 3D — Hero Adventure KAFA

Permainan pengembaraan 3D berkotak (voxel/sandbox-inspired) yang boleh dimainkan **serentak oleh maksimum 10 pemain dalam satu bilik**. 10 hero asal daripada versi 2D, pertempuran kooperatif, 3 Gerbang Ilmu (3 subjek setiap gerbang, 9 kuiz untuk misi utama), 58 soalan latihan KAFA Darjah 4, skill mengikut watak dan satu bos terakhir.

**Status:** prototaip 3D multiplayer yang boleh dimainkan. Tidak mempunyai akaun, chat, avatar Roblox rasmi atau infrastruktur Roblox. Grafik 3D WebGL asli (tanpa CDN atau pakej luaran). Semua pemain menyertai pelayan yang sama.

## Syarat

- **Node.js 20 atau lebih baharu**
- Chrome/Edge/Firefox/Safari terkini dengan WebGL diaktifkan
- Komputer untuk menghoskan pelayan; pemain boleh menyertai menggunakan telefon atau komputer.

## 🌐 Main secara ONLINE (telefon berlainan rumah)

Baca **`ONLINE_CARA_PASANG.md`**. Projek ini disertakan `render.yaml`, `Dockerfile`, endpoint `/health` dan butang **🔗 JEMPUT KAWAN** (URL bilik) supaya boleh dipasang pada hos yang menyokong Node.js + WebSocket. **Hosting awam tidak diwujudkan hanya dengan memuat turun ZIP.**

## 1 — Jalankan game

**Cara mudah di Windows:** ekstrak fail ZIP, pasang [Node.js](https://nodejs.org/) versi 20 ke atas, kemudian dwiklik `START_GAME_WINDOWS.bat`. Tetingkap game terbuka secara automatik. **Jangan tutup** tetingkap hitam pelayan semasa bermain.

**Di macOS/Linux:** jalankan `./START_GAME_MAC_LINUX.sh`.

Atau melalui terminal:

```bash
cd alam_hikmah_3d_multiplayer
npm start
```

Atau `node server.js`. Tiada `npm install` diperlukan.

Buka **http://localhost:3000** di komputer yang menghoskan. Pilih hero dan klik **CIPTA BILIK BARU**. Anda akan menerima **kod lima aksara**.

## 2 — Main 10 orang (Wi-Fi yang sama)

Semua pemain perlu disambungkan ke Wi-Fi yang sama. Dapatkan IP LAN komputer pelayan (contoh `192.168.1.20`), kemudian setiap telefon buka `http://192.168.1.20:3000`.

Pemain pertama cipta bilik dan kongsi kod (atau tekan **🔗 JEMPUT KAWAN** untuk pautan). Sembilan pemain lain pilih hero dan **SERTAI** menggunakan kod tersebut. Maksimum **10 setiap bilik**. Firewall komputer perlu membenarkan sambungan TCP port **3000** pada rangkaian setempat.

> Bagi bermain melalui internet dari lokasi berbeza, hoskan aplikasi Node.js ini pada perkhidmatan yang menyokong WebSocket (contoh VPS / pelayan Node dengan HTTPS dan WSS). Salinan ZIP ini bukan pautan permainan awam yang sudah dihoskan. Jangan buka port rumah terus ke internet tanpa langkah keselamatan rangkaian.

## 3 — Kawalan

| Aksi | Komputer | Telefon |
| --- | --- | --- |
| Bergerak | WASD / anak panah | Pad arah |
| Serang makhluk | J atau Space | ⚔️ SERANG |
| Kuasa khas | K | ✨ SKILL |
| Jawab kuiz berdekatan Gerbang Ilmu | E | 📖 QUIZ |
| Pilih jawapan | Klik atau 1–4 | Sentuh jawapan |

**Misi:** Kerjasama mengalahkan makhluk kabus untuk dapat XP dan bintang. Pergi ke Gerbang Akhlak, Iman dan Hikmah; jawab **3 soalan berlainan subjek** dengan betul bagi setiap gerbang (9 soalan untuk semua subjek). Selepas ketiga-tiga gerbang dibuka, barulah seluruh pasukan boleh menyerang Raja Kabus berhampiran istana di utara.

## Watak

Atiqah, Aisya, Ammar, Alisha, Ali, Maryam, Khadeeja, Ana, Yusuf, Jasmin. Setiap seorang mempunyai HP, kelajuan, kuasa serangan dan skill unik, yang boleh digunakan setiap 9 saat.

## Subjek

Al-Quran, Feqah, Akhlak, Bahasa Arab, Tauhid, Jawi, Hadis, Tafsir dan Sirah/KAFA. **58 soalan latihan contoh** yang diambil daripada versi permainan terdahulu; ini **bukan** soalan peperiksaan rasmi atau jaminan pematuhan silibus negeri tertentu. Disarankan untuk menyemak soalan dengan guru KAFA sebelum digunakan sebagai persediaan peperiksaan.

## Struktur projek

- `server.js` — pelayan HTTP/WebSocket, kawalan bilik dan permainan, skor, combat, soalan dan pengesahan jawapan
- `public/index.html` — menu pilihan hero, HUD, kuiz
- `public/style.css` — antara muka desktop dan telefon
- `public/game.js` — 3D WebGL custom, gerakan watak, renderer, kawalan
- `data/heroes.json` — 10 watak dan statistik
- `data/questions.json` — 58 soalan dan penerangan
- `tests/` — ujian kesambungan dan 10 pemain

## Keselamatan dan batasan prototaip

- Semasa menjawab kuiz, hero kebal daripada kerosakan musuh untuk memberi ruang berfikir.
- Jawapan disemak pelayan (tidak dihantar sebelum pemain menjawab).
- Server mengawal lokasi, cooldown, HP, kematian, level, damage dan maksimum 10 pemain; client tidak boleh menetapkan skor sendiri.
- Room dan progress disimpan **dalam ingatan pelayan sahaja**; akan hilang apabila pelayan ditutup/dimulakan semula.
- Belum mempunyai save cloud, login, sistem moderasi, level design besar, audio, leaderboard kekal, matchmaking awam, anti-cheat penuh atau sistem hosting terurus.
- Bilangan pemain dihadkan pada **10 setiap bilik**, tetapi prototaip belum menjalani ujian beban pengeluaran dalam talian.
- Seperti aplikasi multiplayer WebSocket yang lain, gunakan **HTTPS/WSS** apabila dipasang pada internet awam.

## Ujian

```bash
npm test
```

