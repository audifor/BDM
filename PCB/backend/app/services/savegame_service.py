from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, Optional


def _safe_json(raw: str | None) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        return {}


def get_savegame(conn: sqlite3.Connection) -> Optional[Dict[str, Any]]:
    try:
        row = conn.execute(
            "SELECT id, name, current_season_id, data_json, created_at, updated_at "
            "FROM savegame ORDER BY id LIMIT 1"
        ).fetchone()
    except sqlite3.OperationalError:
        return None

    if not row:
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "current_season_id": row["current_season_id"],
        "data": _safe_json(row["data_json"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def ensure_savegame(conn: sqlite3.Connection, db_path: Path | None = None) -> Dict[str, Any]:
    existing = get_savegame(conn)
    if existing:
        return existing

    now = int(time.time())
    name = db_path.stem if db_path else "Savegame"
    meta = {
        "schema_version": "002_phase1_foundation",
        "db": str(db_path) if db_path else "",
    }
    cur = conn.execute(
        "INSERT INTO savegame (name, created_at, updated_at, current_season_id, data_json) "
        "VALUES (?, ?, ?, ?, ?)",
        (name, now, now, None, json.dumps(meta, ensure_ascii=True)),
    )
    conn.commit()
    return {
        "id": int(cur.lastrowid),
        "name": name,
        "current_season_id": None,
        "data": meta,
        "created_at": now,
        "updated_at": now,
    }
