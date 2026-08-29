from __future__ import annotations

import sqlite3
from typing import Any, Dict

from ..repo import team_repo


def list_teams(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    limit = int(payload.get("limit", 50))
    offset = int(payload.get("offset", 0))

    items = team_repo.list_teams(conn, limit=limit, offset=offset)
    total = conn.execute("SELECT COUNT(1) FROM team").fetchone()[0]
    return {"items": items, "total": total}
