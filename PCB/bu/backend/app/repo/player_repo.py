from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List


def list_players(conn: sqlite3.Connection, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    cur = conn.execute(
        "SELECT id, name, data_json, updated_at FROM player ORDER BY id LIMIT ? OFFSET ?",
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


def create_player(conn: sqlite3.Connection, name: str, data: Dict[str, Any], updated_at: int):
    cur = conn.execute(
        "INSERT INTO player (name, data_json, updated_at) VALUES (?, ?, ?)",
        (name, json.dumps(data, ensure_ascii=True), updated_at),
    )
    conn.commit()
    player_id = cur.lastrowid
    return int(player_id), {"id": int(player_id), "name": name, "data": data, "updated_at": updated_at}
