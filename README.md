# searchhost (build terkompilasi)

Ini adalah versi **hasil compile** dari aplikasi searchhost -- bukan source code asli.
Logic inti (`telegram_login`, `dashboard`) sudah dikompilasi jadi `.pyd` (kode mesin,
via Nuitka), jadi tetap jalan persis seperti biasa lewat `python main.py`, tapi isinya
gak bisa dibuka/dibaca sebagai teks.

## Cara pakai

```
pip install -r requirements.txt
python main.py
```

- Isi nomor lewat prompt interaktif, atau copy `data/numbers.txt.example` jadi
  `data/numbers.txt` (satu nomor per baris, format internasional `+62...`).
- Tiap nomor akan diminta OTP (dan password 2FA kalau akun itu mengaktifkannya).
- Session tersimpan di `sessions/<nomor>.session` -- login berikutnya gak perlu OTP lagi.
- Setelah semua akun login, akan ditanya mau langsung nyalain auto-download + dashboard
  live monitoring atau enggak.
- Mau nyalain lagi tanpa login ulang (pakai session yang udah ada)? `python monitor.py`.

## Konfigurasi

- Copy `.env.example` jadi `.env`, isi sesuai kebutuhan (lihat komentar di dalamnya).
- api_id/api_hash Telegram: ikuti prompt interaktif pas pertama kali jalan (otomatis
  disimpan ke `data/api_credentials.json` biar run berikutnya gak perlu ulang).

## Kenapa isinya beda dari source code biasa

| File | Isinya |
|---|---|
| `main.py`, `monitor.py` | Plain Python biasa, cuma pemanggil -- gak ada logic sensitif |
| `telegram_login.cp313-win_amd64.pyd` | Kode mesin hasil compile package `telegram_login/` |
| `dashboard.cp313-win_amd64.pyd` | Kode mesin hasil compile package `dashboard/` |
| `dashboard/templates/`, `dashboard/static/` | Tampilan (HTML/CSS/JS) dashboard -- bukan logic, tetap plain text |

File `.pyd` dibuat khusus buat Python 3.13 di Windows 64-bit -- kalau versi Python beda,
perlu di-compile ulang dari source aslinya.

## Batasan

- Folder `sessions/`, `download/`, `parsed_data/`, `data/downloads.db` sengaja
  dikosongkan di build ini -- setiap instalasi mulai dari kondisi bersih (belum login,
  belum ada riwayat download).
