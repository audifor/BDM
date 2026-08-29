from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List, Tuple


def list_contracts(conn: sqlite3.Connection, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    cur = conn.execute(
        "SELECT id, player_id, team_id, data_json, updated_at FROM contract ORDER BY id LIMIT ? OFFSET ?",
        (limit, offset),
    )
    items = []
    for row in cur.fetchall():
        data = json.loads(row["data_json"])
        items.append(
            {
                "id": row["id"],
                "player_id": row["player_id"],
                "team_id": row["team_id"],
                "data": data,
                "updated_at": row["updated_at"],
            }
        )
    return items


def create_contract(
    conn: sqlite3.Connection,
    player_id: int,
    team_id: int,
    data: Dict[str, Any],
    updated_at: int,
) -> Tuple[int, Dict[str, Any]]:
    cur = conn.execute(
        "INSERT INTO contract (player_id, team_id, data_json, updated_at) VALUES (?, ?, ?, ?)",
        (player_id, team_id, json.dumps(data, ensure_ascii=True), updated_at),
    )
    conn.commit()
    contract_id = cur.lastrowid
    return int(contract_id), {
        "id": int(contract_id),
        "player_id": player_id,
        "team_id": team_id,
        "data": data,
        "updated_at": updated_at,
    }
