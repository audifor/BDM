from __future__ import annotations

import sqlite3
from typing import Any, Dict

from ..repo import agent_repo


def list_agents(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    limit = int(payload.get("limit", 50))
    offset = int(payload.get("offset", 0))

    items = agent_repo.list_agents(conn, limit=limit, offset=offset)
    total = conn.execute("SELECT COUNT(1) FROM agent").fetchone()[0]
    return {"items": items, "total": total}
