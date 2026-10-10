# 🌐 Jadikan ALAM HIKMAH 3D website online

Fail di dalam folder ini sudah sedia dipasang ke server Node.js/WebSocket. **Fail ZIP sahaja belum menjadikan permainan online** — anda perlu menyiarkannya pada akaun hosting.

## A. Paling mudah: sambungkan Render ke ChatGPT

Dalam ChatGPT, sambungkan app **Render** yang dicadangkan. Setelah diberi kebenaran sambungan, minta ChatGPT untuk menyambung penerbitan game ini menggunakan perkhidmatan Render. Jangan kongsi kata laluan atau kunci API di dalam chat.

## B. Pemasangan manual dengan GitHub + Render

1. Buka [github.com/new](https://github.com/new) dan cipta repositori baru bernama `alam-hikmah-3d-game` (private pun boleh sekiranya anda sambungkan akaun GitHub ke Render).
2. Di komputer, ekstrak ZIP. Masuk folder `alam_hikmah_3d_multiplayer` dan **upload semua fail dan folder di dalamnya** (bukan fail ZIP) ke repo GitHub menggunakan **Add file → Upload files → Commit changes**. Pastikan `render.yaml`, `server.js`, `package.json`, `public/`, dan `data/` berada di *root* repositori.
3. Buka [dashboard.render.com](https://dashboard.render.com), log masuk, pilih **New → Blueprint** (atau `Web Service`), dan sambungkan repositori GitHub tadi.
4. Jika guna **Blueprint**: Render membaca `render.yaml` automatik. Pilih `Apply` untuk membina web service. Jika guna **Web Service** secara manual, tetapkan: Language `Node`; Build command `npm install --omit=dev`; Start command `npm start`; Instance `Free`; Health Check `/health`; region terdekat Singapore jika ada.
5. Selepas status menunjukkan **Live**, Render memberikan alamat seperti `https://alam-hikmah-3d-game.onrender.com` (alamat sebenar bergantung pada nama dan ketersediaan yang diberikan Render).
6. Buka URL itu di telefon, pilih hero dan tekan `CIPTA BILIK BARU`. Tekan butang **🔗 JEMPUT KAWAN**, kemudian kongsi di WhatsApp. Sembilan pemain lain buka pautan itu, pilih hero, dan tekan `SERTAI` untuk masuk ke bilik sama.

**Penting:** Jangan anggap contoh `onrender.com` di atas sudah aktif. Gunakan URL sebenar yang Render paparkan selepas deploy berjaya.

## Had dan batasan

- Maksimum **10 pemain serentak dalam satu bilik**, hero boleh dipilih oleh lebih daripada satu pemain.
- Bilik dan markah disimpan sementara dalam ingatan server sahaja. Semua akan hilang jika server restart/spin down.
- Pelan `Free` Render boleh tidur setelah 15 minit tanpa trafik masuk, dan mungkin mengambil kira-kira seminit untuk hidup semula. Apabila pemain aktif, aplikasi menghantar heartbeat 30 saat melalui WebSocket.
- Ini **prototip game**, belum menerima ujian beban 10 pemain jarak jauh pada talian sebenar.
- Tidak mempunyai chat terbuka, alamat e-mel pemain atau akaun. **Jangan kongsi kod bilik / pautan jemputan secara terbuka**, kerana sesiapa yang dapat pautan boleh cuba masuk selagi bilik belum penuh.
- Jika laman gagal hidup, buka `Logs` pada Render; semak bahawa `npm start` berjaya dan endpoint `/health` memulangkan `{"ok":true,...}`.
- Jika QR/WhatsApp membuka game tetapi sambungan gagal, pastikan laman dibuka melalui **HTTPS**, sambungan websocket `wss://.../ws` dibenarkan, dan semua orang menggunakan pautan dari deployment yang sama.

## Ujian developer

```bash
node --version
npm test
npm start
```

Buka `http://localhost:3000` pada komputer sendiri untuk ujian lokal, atau gunakan alamat `https://...onrender.com` selepas pelancaran awam.
