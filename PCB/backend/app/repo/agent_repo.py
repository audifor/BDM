from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List


def list_agents(conn: sqlite3.Connection, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    cur = conn.execute(
        "SELECT agent_id, agency_id, name, data_json, updated_at FROM agent ORDER BY name LIMIT ? OFFSET ?",
        (limit, offset),
    )
    items = []
    for row in cur.fetchall():
        data = json.loads(row["data_json"])
        items.append(
            {
                "agent_id": row["agent_id"],
                "agency_id": row["agency_id"],
                "name": row["name"],
                "data": data,
                "updated_at": row["updated_at"],
            }
        )
    return items


def create_agent(
    conn: sqlite3.Connection,
    agent_id: str,
    agency_id: str,
    name: str,
    data: Dict[str, Any],
    updated_at: int,
) -> Dict[str, Any]:
    conn.execute(
        "INSERT INTO agent (agent_id, agency_id, name, data_json, updated_at) VALUES (?, ?, ?, ?, ?)",
        (agent_id, agency_id, name, json.dumps(data, ensure_ascii=True), updated_at),
    )
    return {"agent_id": agent_id, "agency_id": agency_id, "name": name, "data": data, "updated_at": updated_at}
