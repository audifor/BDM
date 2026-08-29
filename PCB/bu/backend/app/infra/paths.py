from __future__ import annotations

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]  # backend/
DATA_DIR = BASE_DIR / "data"
LOG_DIR = BASE_DIR / "logs"
DEFAULT_DB = DATA_DIR / "dev.sqlite"


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
