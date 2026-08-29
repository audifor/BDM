from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List


def list_agencies(conn: sqlite3.Connection, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    cur = conn.execute(
        "SELECT agency_id, name, data_json, updated_at FROM agency ORDER BY name LIMIT ? OFFSET ?",
        (limit, offset),
    )
    items = []
    for row in cur.fetchall():
        data = json.loads(row["data_json"])
        items.append(
            {
                "agency_id": row["agency_id"],
                "name": row["name"],
                "data": data,
                "updated_at": row["updated_at"],
            }
        )
    return items


def create_agency(conn: sqlite3.Connection, agency_id: str, name: str, data: Dict[str, Any], updated_at: int) -> Dict[str, Any]:
    conn.execute(
        "INSERT INTO agency (agency_id, name, data_json, updated_at) VALUES (?, ?, ?, ?)",
        (agency_id, name, json.dumps(data, ensure_ascii=True), updated_at),
    )
    return {"agency_id": agency_id, "name": name, "data": data, "updated_at": updated_at}
