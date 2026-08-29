from __future__ import annotations

import json
import sqlite3
import time
from typing import Any, Dict

from ..repo import contract_repo, player_repo
from .contract_factory import create_contract_data
from .generator_service import generate_player
from .name_service import generate_name


def list_players(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    limit = int(payload.get("limit", 50))
    offset = int(payload.get("offset", 0))

    items = player_repo.list_players(conn, limit=limit, offset=offset)
    total = conn.execute("SELECT COUNT(1) FROM player").fetchone()[0]
    return {"items": items, "total": total}


def create_player(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    count = int(payload.get("count", 1))
    team_id = payload.get("team_id")
    create_contract = payload.get("create_contract", True)

    created = []
    team_budget = 0
    roster_size = 12
    if team_id:
        row = conn.execute("SELECT data_json FROM team WHERE id = ?", (team_id,)).fetchone()
        if row and row["data_json"]:
            data = json.loads(row["data_json"])
            team_budget = int(data.get("budget") or 0)
            roster_size = int(data.get("roster_size") or 12)

    for idx in range(max(1, count)):
        data = payload.get("data")
        if not data:
            data = generate_player()
        if team_id:
            data["team_id"] = team_id
        base_name = payload.get("name")
        if base_name:
            name = base_name if count == 1 else f"{base_name} {idx + 1}"
        else:
            nationality = data.get("bio", {}).get("nationality", "ES")
            name = generate_name(nationality)

        player_id, row = player_repo.create_player(conn, name=name, data=data, updated_at=int(time.time()))
        created.append(row)
        if team_id and create_contract:
            tier = int(data.get("scout", {}).get("tier") or 3)
            contract = payload.get("contract") or create_contract_data(tier, team_budget, roster_size=roster_size)
            contract_repo.create_contract(
                conn,
                player_id=player_id,
                team_id=int(team_id),
                data=contract,
                updated_at=int(time.time()),
            )

    return {"items": created, "total": len(created)}
