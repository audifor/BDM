from __future__ import annotations

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]  # backend/
DATA_DIR = BASE_DIR / "data"
LOG_DIR = BASE_DIR / "logs"
SAVES_DIR = DATA_DIR / "saves"
DEFAULT_DB = DATA_DIR / "dev.sqlite"


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    SAVES_DIR.mkdir(parents=True, exist_ok=True)


def savegame_dir(save_id: str) -> Path:
    return SAVES_DIR / save_id
