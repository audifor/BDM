from __future__ import annotations

import json
import random
import time
import sqlite3
from typing import Dict, List, Tuple

from ..repo import agent_repo, agency_repo, player_repo
from ..services.generator_service import generate_player
from ..services.name_service import generate_name
from ..services.contract_factory import create_contract_data, create_staff_contract_data
from ..services.staff_generator import generate_staff_for_team
from ..services.board_generator import generate_board_for_team
from ..services.agency_generator import generate_agencies, generate_agents


TEAMS = [
    {"name": "Real Madrid", "city": "Madrid", "budget": 5_000_000, "reputation": 850},
    {"name": "Barca", "city": "Barcelona", "budget": 4_500_000, "reputation": 830},
    {"name": "Valencia Basket", "city": "Valencia", "budget": 3_200_000, "reputation": 760},
    {"name": "Baskonia", "city": "Vitoria-Gasteiz", "budget": 3_000_000, "reputation": 740},
    {"name": "Unicaja Malaga", "city": "Malaga", "budget": 2_800_000, "reputation": 720},
    {"name": "Dreamland Gran Canaria", "city": "Las Palmas", "budget": 2_400_000, "reputation": 690},
    {"name": "La Laguna Tenerife", "city": "La Laguna", "budget": 2_300_000, "reputation": 680},
    {"name": "Joventut Badalona", "city": "Badalona", "budget": 2_200_000, "reputation": 670},
    {"name": "UCAM Murcia", "city": "Murcia", "budget": 2_100_000, "reputation": 660},
    {"name": "Casademont Zaragoza", "city": "Zaragoza", "budget": 2_000_000, "reputation": 650},
    {"name": "BAXI Manresa", "city": "Manresa", "budget": 1_900_000, "reputation": 640},
    {"name": "Surne Bilbao Basket", "city": "Bilbao", "budget": 1_800_000, "reputation": 630},
    {"name": "MoraBanc Andorra", "city": "Andorra la Vella", "budget": 1_750_000, "reputation": 620},
    {"name": "Recoletas Salud San Pablo Burgos", "city": "Burgos", "budget": 1_500_000, "reputation": 595},
    {"name": "Hiopos Lleida", "city": "Lleida", "budget": 1_450_000, "reputation": 590},
    {"name": "Coviran Granada", "city": "Granada", "budget": 1_650_000, "reputation": 610},
    {"name": "Rio Breogan", "city": "Lugo", "budget": 1_600_000, "reputation": 605},
    {"name": "Basquet Girona", "city": "Girona", "budget": 1_550_000, "reputation": 600},
]

POSITIONS = ["PG", "SG", "SF", "PF", "C"]
DEFAULT_UNIVERSE = "FIBA"


def _roster_size_for_budget(budget: int) -> int:
    if budget >= 4_000_000:
        return 14
    if budget >= 2_500_000:
        return 13
    return 12


def _tier_thresholds() -> Tuple[int, int]:
    budgets = sorted([t["budget"] for t in TEAMS], reverse=True)
    if len(budgets) < 3:
        return budgets[0] if budgets else 0, budgets[-1] if budgets else 0
    top_cut = budgets[min(5, len(budgets) - 1)]
    mid_cut = budgets[min(11, len(budgets) - 1)]
    return top_cut, mid_cut


def _tier_for_budget(budget: int) -> int:
    top_cut, mid_cut = _tier_thresholds()
    if budget >= top_cut:
        return 1
    if budget >= mid_cut:
        return 2
    return 3


def _staff_size_for_tier(tier: int) -> int:
    if tier <= 1:
        return random.randint(13, 16)
    if tier == 2:
        return random.randint(10, 13)
    return random.randint(7, 10)


def _board_size_for_tier(tier: int) -> int:
    if tier <= 1:
        return random.randint(9, 12)
    if tier == 2:
        return random.randint(7, 9)
    return random.randint(5, 7)


def _seed_teams(conn: sqlite3.Connection, force: bool = False) -> List[Tuple[int, str, int, int]]:
    now = int(time.time())
    existing = conn.execute("SELECT id, name, data_json FROM team").fetchall()
    if existing and not force:
        team_ids = []
        for row in existing:
            data = json.loads(row["data_json"]) if row["data_json"] else {}
            team_ids.append(
                (
                    int(row["id"]),
                    row["name"],
                    int(data.get("budget") or 0),
                    int(data.get("roster_size") or 12),
                )
            )
        return team_ids

    conn.execute("DELETE FROM team")
    team_ids: List[Tuple[int, str, int, int]] = []
    for t in TEAMS:
        roster_size = int(t.get("roster_size") or _roster_size_for_budget(t["budget"]))
        tier = _tier_for_budget(t["budget"])
        data = {
            "city": t["city"],
            "budget": t["budget"],
            "reputation": t["reputation"],
            "roster_size": roster_size,
            "tier": tier,
        }
        cur = conn.execute(
            "INSERT INTO team (name, data_json, updated_at) VALUES (?, ?, ?)",
            (t["name"], json.dumps(data, ensure_ascii=True), now),
        )
        team_ids.append((int(cur.lastrowid), t["name"], t["budget"], roster_size))
    conn.commit()
    return team_ids


def _seed_contract(conn: sqlite3.Connection, player_id: int, team_id: int, contract: Dict[str, object]) -> None:
    now = int(time.time())
    conn.execute(
        "INSERT INTO contract (player_id, team_id, data_json, updated_at) VALUES (?, ?, ?, ?)",
        (player_id, team_id, json.dumps(contract, ensure_ascii=True), now),
    )


def seed_demo_players(conn: sqlite3.Connection) -> None:
    now = int(time.time())
    teams = _seed_teams(conn, force=True)

    conn.execute("DELETE FROM player")
    conn.execute("DELETE FROM contract")
    conn.execute("DELETE FROM agent")
    conn.execute("DELETE FROM agency")

    agencies = generate_agencies(count=10)
    agency_map = {}
    for agency in agencies:
        agency_id = agency["agency_id"]
        agency_map[agency_id] = agency
        agency_repo.create_agency(conn, agency_id=agency_id, name=agency["name"], data=agency, updated_at=now)

    agents = generate_agents(agencies, per_agency=(3, 6))
    for agent in agents:
        agent_repo.create_agent(
            conn,
            agent_id=agent["agent_id"],
            agency_id=agent["agency_id"],
            name=agent["name"],
            data=agent,
            updated_at=now,
        )

    used_names: set[str] = set()
    for team_id, team_name, team_budget, roster_size in teams:
        team_row = conn.execute("SELECT data_json FROM team WHERE id = ?", (team_id,)).fetchone()
        team_data = json.loads(team_row["data_json"]) if team_row and team_row["data_json"] else {}
        tier = int(team_data.get("tier") or _tier_for_budget(team_budget))
        staff_list = generate_staff_for_team(_staff_size_for_tier(tier))
        for member in staff_list:
            member["contract"] = create_staff_contract_data(
                tier=tier,
                team_budget=team_budget,
                staff_size=len(staff_list),
                universe=DEFAULT_UNIVERSE,
            )
        team_data["staff"] = staff_list
        team_data["board"] = generate_board_for_team(_board_size_for_tier(tier))
        conn.execute(
            "UPDATE team SET data_json = ?, updated_at = ? WHERE id = ?",
            (json.dumps(team_data, ensure_ascii=True), now, team_id),
        )

        roster_positions = []
        for pos in POSITIONS:
            roster_positions.extend([pos, pos])
        remaining = max(roster_size - len(roster_positions), 0)
        for _ in range(remaining):
            roster_positions.append(random.choice(POSITIONS))
        random.shuffle(roster_positions)

        for idx in range(roster_size):
            pos = roster_positions[idx % len(roster_positions)]
            data = generate_player(pos=pos)
            data["bio"]["pos"] = pos
            data["team_id"] = team_id
            if agents:
                agent = random.choice(agents)
                agency = agency_map.get(agent["agency_id"])
                data["agent_id"] = agent["agent_id"]
                data["agency_id"] = agent["agency_id"]
                data["agent_name"] = agent["name"]
                data["agency_name"] = agency["name"] if agency else ""
            nationality = data["bio"].get("nationality", "ES")
            name = generate_name(nationality, used_names)
            player_id, _ = player_repo.create_player(conn, name=name, data=data, updated_at=now)
            tier = int(data.get("scout", {}).get("tier") or 3)
            contract = create_contract_data(
                tier,
                team_budget,
                roster_size=roster_size,
                universe=DEFAULT_UNIVERSE,
            )
            _seed_contract(conn, player_id, team_id, contract)

    conn.commit()
