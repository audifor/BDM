from __future__ import annotations

import sqlite3
from typing import Any, Dict

from ..repo import agency_repo


def list_agencies(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    limit = int(payload.get("limit", 50))
    offset = int(payload.get("offset", 0))

    items = agency_repo.list_agencies(conn, limit=limit, offset=offset)
    total = conn.execute("SELECT COUNT(1) FROM agency").fetchone()[0]
    return {"items": items, "total": total}
