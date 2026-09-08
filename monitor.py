"""Entry point: python monitor.py

Lanjut auto-download file .txt + dashboard live monitoring pakai session yang sudah pernah
login lewat main.py -- tidak perlu OTP lagi selama session masih valid.
"""

import asyncio
import glob
import os

from telethon import TelegramClient

from telegram_login.config import (
    DEFAULT_API_ID,
    DEFAULT_API_HASH,
    SESSIONS_DIR,
    CONNECTION_RETRIES,
    RETRY_DELAY_SECONDS,
)
from telegram_login.credentials import load_cached_credentials
from telegram_login.monitor import start_monitoring


def find_session_phones() -> list[str]:
    paths = glob.glob(os.path.join(SESSIONS_DIR, "*.session"))
    return [os.path.splitext(os.path.basename(p))[0] for p in paths]


def _suppress_harmless_connection_reset(loop: asyncio.AbstractEventLoop, context: dict) -> None:
    """Diemin noise "Exception in callback ..._call_connection_lost()" (WinError 10054)
    yang BENERAN harmless -- ini `ProactorEventLoop` bawaan asyncio di Windows lagi
    beres-beres 1 socket abis server Telegram motong koneksinya duluan (wajar kejadian,
    Telethon buka-tutup banyak koneksi paralel mis. FastTelethon sampai 16 sekaligus).
    Exception ini sendiri sudah ketangkep INTERNAL sama asyncio (lihat `Handle._run()` di
    asyncio/events.py) SEBELUM sampai ke sini -- gak pernah bikin event loop atau
    auto-download berhenti, cuma bikin layar berisik/bikin panik padahal aman.

    Cocokin SPESIFIK banget (jenis exception + kode error Windows + nama callback-nya)
    biar cuma kasus kosmetik ini yang didiemin -- exception LAIN apa pun (termasuk
    ConnectionResetError dari tempat lain yang mungkin beneran perlu diperhatikan) tetap
    diteruskan ke default handler asyncio, tetap keliatan seperti biasa.
    """
    exc = context.get("exception")
    message = context.get("message", "")
    if (
        isinstance(exc, ConnectionResetError)
        and getattr(exc, "winerror", None) == 10054
        and "_call_connection_lost" in message
    ):
        return
    loop.default_exception_handler(context)


async def main():
    asyncio.get_running_loop().set_exception_handler(_suppress_harmless_connection_reset)

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
        client = TelegramClient(
            os.path.join(SESSIONS_DIR, phone),
            api_id,
            api_hash,
            connection_retries=CONNECTION_RETRIES,
            retry_delay=RETRY_DELAY_SECONDS,
        )
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
