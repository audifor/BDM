from __future__ import annotations

import sqlite3
from typing import Any, Dict

from ..services import agency_service, agent_service, contract_service, player_service, team_service


class UnknownCommand(Exception):
    pass


def dispatch(command: str, payload: Dict[str, Any], conn: sqlite3.Connection) -> Dict[str, Any]:
    if command == "ping":
        return {"message": "pong"}
    if command == "player.list":
        return player_service.list_players(conn, payload or {})
    if command == "player.create":
        return player_service.create_player(conn, payload or {})
    if command == "team.list":
        return team_service.list_teams(conn, payload or {})
    if command == "contract.list":
        return contract_service.list_contracts(conn, payload or {})
    if command == "agency.list":
        return agency_service.list_agencies(conn, payload or {})
    if command == "agent.list":
        return agent_service.list_agents(conn, payload or {})
    raise UnknownCommand(command)
