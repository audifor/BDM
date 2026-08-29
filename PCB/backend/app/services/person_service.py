from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List


def _normalize_query(payload: Dict[str, Any]) -> str:
    raw = payload.get("query") or payload.get("q") or ""
    return str(raw).strip()


def _sort_key(name: str, query: str) -> tuple:
    lowered = name.lower()
    q = query.lower()
    if lowered == q:
        return (0, len(lowered), lowered)
    if lowered.startswith(q):
        return (1, len(lowered), lowered)
    return (2, len(lowered), lowered)


def _safe_json(value: str | None) -> Dict[str, Any]:
    if not value:
        return {}
    try:
        return json.loads(value)
    except Exception:
        return {}


def search_people(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    query = _normalize_query(payload)
    limit = int(payload.get("limit") or 20)
    if limit < 1:
        return {"items": [], "count": 0}
    if len(query) < 2:
        return {"items": [], "count": 0}

    like = f"%{query.lower()}%"
    items: List[Dict[str, Any]] = []

    team_rows = conn.execute("SELECT id, name, data_json FROM team ORDER BY id").fetchall()
    team_map = {int(row["id"]): row["name"] for row in team_rows}

    # Players
    player_rows = conn.execute(
        "SELECT id, name, data_json FROM player WHERE LOWER(name) LIKE ? ORDER BY name LIMIT ?",
        (like, max(limit, 50)),
    ).fetchall()
    for row in player_rows:
        data = _safe_json(row["data_json"])
        team_id = data.get("team_id")
        bio = data.get("bio") or {}
        team_name = ""
        if team_id is not None:
            try:
                team_name = team_map.get(int(team_id), "")
            except (TypeError, ValueError):
                team_name = ""
        items.append(
            {
                "id": f"player:{row['id']}",
                "person_id": row["id"],
                "name": row["name"],
                "type": "player",
                "team_id": team_id,
                "team_name": team_name,
                "role": bio.get("pos") or "",
            }
        )

    # Staff and board members are embedded in team data_json
    for row in team_rows:
        team_id = int(row["id"])
        team_name = row["name"]
        team_data = _safe_json(row["data_json"])

        staff_list = team_data.get("staff") or []
        for idx, staff in enumerate(staff_list):
            name = str(staff.get("name") or "").strip()
            if not name:
                continue
            if query.lower() not in name.lower():
                continue
            items.append(
                {
                    "id": f"staff:{team_id}:{idx}",
                    "person_id": f"{team_id}:{idx}",
                    "name": name,
                    "type": "staff",
                    "team_id": team_id,
                    "team_name": team_name,
                    "role": staff.get("role") or staff.get("department") or "",
                }
            )

        board_list = team_data.get("board") or []
        for idx, member in enumerate(board_list):
            name = str(member.get("name") or "").strip()
            if not name:
                continue
            if query.lower() not in name.lower():
                continue
            items.append(
                {
                    "id": f"board:{team_id}:{idx}",
                    "person_id": f"{team_id}:{idx}",
                    "name": name,
                    "type": "board",
                    "team_id": team_id,
                    "team_name": team_name,
                    "role": member.get("role") or member.get("profile_label") or "Directiva",
                }
            )

    # Agents
    agency_rows = conn.execute("SELECT agency_id, name FROM agency").fetchall()
    agency_map = {row["agency_id"]: row["name"] for row in agency_rows}
    agent_rows = conn.execute(
        "SELECT agent_id, agency_id, name, data_json FROM agent WHERE LOWER(name) LIKE ? ORDER BY name LIMIT ?",
        (like, max(limit, 50)),
    ).fetchall()
    for row in agent_rows:
        data = _safe_json(row["data_json"])
        agency_id = row["agency_id"]
        items.append(
            {
                "id": f"agent:{row['agent_id']}",
                "person_id": row["agent_id"],
                "name": row["name"],
                "type": "agent",
                "team_id": "",
                "team_name": "",
                "role": "Agente",
                "agency_id": agency_id,
                "agency_name": agency_map.get(agency_id) or data.get("agency_name") or "",
            }
        )

    items.sort(key=lambda item: _sort_key(item.get("name") or "", query))
    trimmed = items[:limit]
    return {"items": trimmed, "count": len(trimmed)}
