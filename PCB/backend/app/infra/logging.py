from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler

from .paths import LOG_DIR, ensure_dirs


def setup_logging(name: str = "engine") -> logging.Logger:
    ensure_dirs()
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)
    log_path = LOG_DIR / "engine.log"
    handler = RotatingFileHandler(log_path, maxBytes=2_000_000, backupCount=3, encoding="utf-8")
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    handler.setFormatter(fmt)
    logger.addHandler(handler)
    return logger
