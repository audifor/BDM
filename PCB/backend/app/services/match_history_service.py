from __future__ import annotations

import sqlite3
from typing import Any, Dict

from ..repo import event_repo, match_repo


def list_matches(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    limit = int(payload.get("limit", 50))
    offset = int(payload.get("offset", 0))
    items = match_repo.list_matches(conn, limit=limit, offset=offset)
    total = conn.execute("SELECT COUNT(1) FROM match").fetchone()[0]
    return {"items": items, "total": total}


def list_events(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    match_id = payload.get("match_id")
    if not match_id:
        raise ValueError("match_id is required")
    limit = payload.get("limit")
    items = event_repo.list_events(conn, int(match_id), limit=int(limit) if limit else None)
    return {"items": items, "total": len(items)}
