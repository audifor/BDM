from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List


def _ensure_market_fields(data: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure player has market-related fields (potential, market_value, position)."""
    import random

    attr_map = data.get("attributes", {})
    overall_est = int(sum(attr_map.values()) / len(attr_map)) if attr_map else 500

    # Calculate potential if missing
    if "potential" not in data:
        age = data.get("bio", {}).get("age", 25)
        overall = overall_est
        potential_bonus = max(0, (28 - age) * 15)
        data["potential"] = min(1000, overall + potential_bonus + random.randint(-30, 50))

    # Calculate market value if missing
    if "market_value" not in data:
        age = data.get("bio", {}).get("age", 25)
        overall = overall_est
        potential = data.get("potential", 500)
        base_value = (overall / 1000) * 5_000_000
        potential_multiplier = 1 + ((potential - overall) / 1000)
        age_multiplier = 1.5 if age <= 23 else 1.2 if age <= 27 else 0.8 if age <= 32 else 0.5
        data["market_value"] = int(base_value * potential_multiplier * age_multiplier)

    # Remove overall from payloads
    data.pop("overall", None)

    # Ensure position field (for compatibility)
    if "position" not in data:
        data["position"] = data.get("bio", {}).get("pos", "SG")

    # Ensure health fields
    health = data.get("health")
    if not isinstance(health, dict):
        health = {}
    health.setdefault("fatigue", 0)
    health.setdefault("injury_status", "healthy")
    data["health"] = health

    # Ensure morale field
    if "morale" not in data:
        data["morale"] = 50

    return data


def list_players(
    conn: sqlite3.Connection,
    limit: int = 50,
    offset: int = 0,
    league_id: str | None = None,
) -> List[Dict[str, Any]]:
    if league_id:
        league_key = str(league_id).upper()
        cur = conn.execute(
            """
            SELECT p.id, p.name, p.data_json, p.updated_at
            FROM player p
            LEFT JOIN team t ON json_extract(p.data_json, '$.team_id') = t.id
            WHERE UPPER(COALESCE(
                json_extract(p.data_json, '$.league_id'),
                json_extract(t.data_json, '$.league_id'),
                json_extract(t.data_json, '$.league')
            )) = ?
            ORDER BY p.id
            LIMIT ? OFFSET ?
            """,
            (league_key, limit, offset),
        )
    else:
        cur = conn.execute(
            "SELECT id, name, data_json, updated_at FROM player ORDER BY id LIMIT ? OFFSET ?",
            (limit, offset),
        )
    items = []
    for row in cur.fetchall():
        data = json.loads(row["data_json"])
        data = _ensure_market_fields(data)
        items.append(
            {
                "id": row["id"],
                "name": row["name"],
                "data": data,
                "updated_at": row["updated_at"],
            }
        )
    return items


def list_players_by_team(conn: sqlite3.Connection, team_id: int) -> List[Dict[str, Any]]:
    cur = conn.execute(
        "SELECT id, name, data_json, updated_at FROM player WHERE json_extract(data_json, '$.team_id') = ? ORDER BY id",
        (int(team_id),),
    )
    items = []
    for row in cur.fetchall():
        data = json.loads(row["data_json"])
        data = _ensure_market_fields(data)
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
