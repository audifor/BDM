from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List, Optional


def list_content(
    conn: sqlite3.Connection,
    content_type: str,
    team_id: Optional[int] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    params: List[Any] = [content_type]
    sql = (
        "SELECT id, team_id, content_type, data_json, created_at "
        "FROM smartphone_content WHERE content_type = ?"
    )
    if team_id is not None:
        sql += " AND (team_id = ? OR team_id IS NULL)"
        params.append(int(team_id))
    sql += " ORDER BY created_at DESC LIMIT ?"
    params.append(int(limit))

    cur = conn.execute(sql, params)
    items: List[Dict[str, Any]] = []
    for row in cur.fetchall():
        data = json.loads(row["data_json"]) if row["data_json"] else {}
        if not isinstance(data, dict):
            data = {"value": data}
        if "id" not in data:
            data["id"] = row["id"]
        if "created_at" not in data:
            data["created_at"] = row["created_at"]
        if "content_type" not in data:
            data["content_type"] = row["content_type"]
        if "team_id" not in data and row["team_id"] is not None:
            data["team_id"] = row["team_id"]
        items.append(data)
    return items


def create_content(
    conn: sqlite3.Connection,
    content_type: str,
    data: Dict[str, Any],
    team_id: Optional[int],
    created_at: int,
) -> Dict[str, Any]:
    cur = conn.execute(
        "INSERT INTO smartphone_content (team_id, content_type, data_json, created_at) VALUES (?, ?, ?, ?)",
        (int(team_id) if team_id is not None else None, str(content_type), json.dumps(data, ensure_ascii=True), int(created_at)),
    )
    conn.commit()
    return {"id": int(cur.lastrowid), "team_id": team_id, "content_type": content_type, "created_at": created_at}


def get_content(conn: sqlite3.Connection, content_id: int) -> Optional[Dict[str, Any]]:
    row = conn.execute(
        "SELECT id, team_id, content_type, data_json, created_at FROM smartphone_content WHERE id = ?",
        (int(content_id),),
    ).fetchone()
    if not row:
        return None
    data = json.loads(row["data_json"]) if row["data_json"] else {}
    if not isinstance(data, dict):
        data = {"value": data}
    data.setdefault("id", row["id"])
    data.setdefault("created_at", row["created_at"])
    data.setdefault("content_type", row["content_type"])
    if row["team_id"] is not None:
        data.setdefault("team_id", row["team_id"])
    return {
        "id": int(row["id"]),
        "team_id": row["team_id"],
        "content_type": row["content_type"],
        "created_at": row["created_at"],
        "data": data,
    }


def update_content(
    conn: sqlite3.Connection,
    content_id: int,
    data: Dict[str, Any],
    content_type: Optional[str] = None,
) -> None:
    payload = json.dumps(data or {}, ensure_ascii=True)
    if content_type:
        conn.execute(
            "UPDATE smartphone_content SET data_json = ?, content_type = ? WHERE id = ?",
            (payload, str(content_type), int(content_id)),
        )
    else:
        conn.execute(
            "UPDATE smartphone_content SET data_json = ? WHERE id = ?",
            (payload, int(content_id)),
        )
    conn.commit()
