from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List


def list_events(conn: sqlite3.Connection, match_id: int, limit: int | None = None) -> List[Dict[str, Any]]:
    sql = (
        "SELECT id, match_id, seq, clock, team, event, data_json "
        "FROM event_log WHERE match_id = ? ORDER BY seq"
    )
    params = [int(match_id)]
    if limit:
        sql += " LIMIT ?"
        params.append(int(limit))
    cur = conn.execute(sql, params)
    items = []
    for row in cur.fetchall():
        data = json.loads(row["data_json"]) if row["data_json"] else {}
        items.append(
            {
                "id": row["id"],
                "match_id": row["match_id"],
                "seq": row["seq"],
                "clock": row["clock"],
                "team": row["team"],
                "event": row["event"],
                "data": data,
            }
        )
    return items
