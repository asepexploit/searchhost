"""Entry point: python monitor.py

Lanjut auto-download file .txt + dashboard live monitoring pakai session yang sudah pernah
login lewat main.py -- tidak perlu OTP lagi selama session masih valid.
"""

import asyncio
import glob
import os

from telethon import TelegramClient

from telegram_login.config import DEFAULT_API_ID, DEFAULT_API_HASH, SESSIONS_DIR
from telegram_login.credentials import load_cached_credentials
from telegram_login.monitor import start_monitoring


def find_session_phones() -> list[str]:
    paths = glob.glob(os.path.join(SESSIONS_DIR, "*.session"))
    return [os.path.splitext(os.path.basename(p))[0] for p in paths]


async def main():
    api_id, api_hash = load_cached_credentials() or (DEFAULT_API_ID, DEFAULT_API_HASH)
    if not api_id or not api_hash:
        print("api_id/api_hash belum ada. Jalankan `python main.py` dulu untuk login & setup kredensial.")
        return

    phones = find_session_phones()
    if not phones:
        print("Belum ada session tersimpan. Jalankan `python main.py` dulu untuk login.")
        return

    accounts = []
    for phone in phones:
        client = TelegramClient(os.path.join(SESSIONS_DIR, phone), api_id, api_hash)
        await client.connect()
        if not await client.is_user_authorized():
            print(f"Session {phone} tidak valid/expired, lewati. Login ulang lewat `python main.py`.")
            await client.disconnect()
            continue
        accounts.append((phone, client))

    await start_monitoring(accounts)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nDihentikan.")
