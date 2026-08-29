from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List


def list_matches(conn: sqlite3.Connection, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    cur = conn.execute(
        "SELECT id, home_team_id, away_team_id, home_score, away_score, possessions, data_json, created_at "
        "FROM match ORDER BY id DESC LIMIT ? OFFSET ?",
        (limit, offset),
    )
    items = []
    for row in cur.fetchall():
        data = json.loads(row["data_json"]) if row["data_json"] else {}
        items.append(
            {
                "id": row["id"],
                "home_team_id": row["home_team_id"],
                "away_team_id": row["away_team_id"],
                "home_score": row["home_score"],
                "away_score": row["away_score"],
                "possessions": row["possessions"],
                "data": data,
                "created_at": row["created_at"],
            }
        )
    return items


def get_match(conn: sqlite3.Connection, match_id: int) -> Dict[str, Any] | None:
    row = conn.execute(
        "SELECT id, home_team_id, away_team_id, home_score, away_score, possessions, data_json, created_at "
        "FROM match WHERE id = ?",
        (int(match_id),),
    ).fetchone()
    if not row:
        return None
    data = json.loads(row["data_json"]) if row["data_json"] else {}
    return {
        "id": row["id"],
        "home_team_id": row["home_team_id"],
        "away_team_id": row["away_team_id"],
        "home_score": row["home_score"],
        "away_score": row["away_score"],
        "possessions": row["possessions"],
        "data": data,
        "created_at": row["created_at"],
    }
