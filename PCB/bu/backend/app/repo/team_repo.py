from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List


def list_teams(conn: sqlite3.Connection, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    cur = conn.execute(
        "SELECT id, name, data_json, updated_at FROM team ORDER BY id LIMIT ? OFFSET ?",
        (limit, offset),
    )
    items = []
    for row in cur.fetchall():
        data = json.loads(row["data_json"])
        items.append(
            {
                "id": row["id"],
                "name": row["name"],
                "data": data,
                "updated_at": row["updated_at"],
            }
        )
    return items
