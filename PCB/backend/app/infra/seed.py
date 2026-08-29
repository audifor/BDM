from __future__ import annotations

import json
import random
import time
import sqlite3
from datetime import date
from pathlib import Path
from typing import Dict, List, Tuple

from ..repo import agent_repo, agency_repo, player_repo
from ..services.generator_service import generate_player
from ..services.name_service import generate_name
from ..services.contract_factory import create_contract_data, create_staff_contract_data
from ..services.staff_generator import generate_staff_for_team
from ..services.board_generator import generate_board_for_team
from ..services.agency_generator import generate_agencies, generate_agents
from ..services import competition_service, youth_service, gm_service


LEAGUE_DIR = Path(__file__).resolve().parent / "leagues"
DEFAULT_TIER_THRESHOLDS = (4_000_000, 2_500_000)


def _load_league_catalog() -> List[Dict[str, object]]:
    leagues: List[Dict[str, object]] = []
    if not LEAGUE_DIR.exists():
        return leagues
    for path in sorted(LEAGUE_DIR.glob("*.json")):
        try:
            with path.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
        except Exception:
            continue
        for league in data.get("leagues", []):
            leagues.append(league)
    return leagues

POSITIONS = ["PG", "SG", "SF", "PF", "C"]
DEFAULT_UNIVERSE = "FIBA"
UNIVERSE_BY_LEAGUE = {
    "ACB": "FIBA",
    "FEB": "FIBA",
    "NBA": "NBA",
    "WNBA": "WNBA",
    "NCAA_M": "NCAA",
    "NCAA_W": "NCAA",
}


def _roster_size_for_budget(budget: int) -> int:
    if budget >= 4_000_000:
        return 14
    if budget >= 2_500_000:
        return 13
    return 12


def _tier_thresholds(budgets: List[int]) -> Tuple[int, int]:
    cleaned = sorted([int(b) for b in budgets if isinstance(b, (int, float))], reverse=True)
    if len(cleaned) < 3:
        return cleaned[0] if cleaned else 0, cleaned[-1] if cleaned else 0
    top_cut = cleaned[min(5, len(cleaned) - 1)]
    mid_cut = cleaned[min(11, len(cleaned) - 1)]
    return top_cut, mid_cut


def _tier_for_budget(budget: int, thresholds: Tuple[int, int] | None = None) -> int:
    top_cut, mid_cut = thresholds or DEFAULT_TIER_THRESHOLDS
    if budget >= top_cut:
        return 1
    if budget >= mid_cut:
        return 2
    return 3


def _quality_for_team(league_level: int, tier: int) -> float:
    level = max(1, int(league_level or 1))
    base = 1.0 - 0.1 * max(0, level - 1)
    tier_shift = {1: 0.06, 2: 0.0, 3: -0.06}.get(int(tier or 2), 0.0)
    return max(0.75, min(1.1, base + tier_shift))


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
    leagues = _load_league_catalog()
    for league in leagues:
        league_id = str(league.get("id") or "").upper() or "ACB"
        league_name = str(league.get("name") or "Liga")
        league_level = int(league.get("level") or 1)
        league_roster_default = league.get("roster_size_default") or league.get("roster_size")
        teams = league.get("teams") or []
        thresholds = _tier_thresholds([t.get("budget", 0) for t in teams])
        for t in teams:
            roster_size = int(
                t.get("roster_size")
                or league_roster_default
                or _roster_size_for_budget(t["budget"])
            )
            tier = _tier_for_budget(int(t["budget"]), thresholds)
            data = {
                "city": t["city"],
                "budget": t["budget"],
                "reputation": t["reputation"],
                "roster_size": roster_size,
                "tier": tier,
                "league_id": league_id,
                "league_name": league_name,
                "league_level": league_level,
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
    league_ids: set[str] = set()
    seed_day = date(2025, 9, 1)
    for team_id, team_name, team_budget, roster_size in teams:
        team_row = conn.execute("SELECT data_json FROM team WHERE id = ?", (team_id,)).fetchone()
        team_data = json.loads(team_row["data_json"]) if team_row and team_row["data_json"] else {}
        league_id = team_data.get("league_id")
        league_ids.add(str(league_id or "").upper())
        universe = UNIVERSE_BY_LEAGUE.get(str(league_id or "").upper(), DEFAULT_UNIVERSE)
        tier = int(team_data.get("tier") or _tier_for_budget(team_budget))
        quality = _quality_for_team(int(team_data.get("league_level") or 1), tier)
        staff_list = generate_staff_for_team(_staff_size_for_tier(tier))
        for member in staff_list:
            member["contract"] = create_staff_contract_data(
                tier=tier,
                team_budget=team_budget,
                staff_size=len(staff_list),
                universe=universe,
            )
        team_data["staff"] = staff_list
        team_data["board"] = generate_board_for_team(_board_size_for_tier(tier))

        # Initialize market system fields
        if "shortlist" not in team_data:
            team_data["shortlist"] = []
        if "active_negotiations" not in team_data:
            team_data["active_negotiations"] = []
        if "agency_relationships" not in team_data:
            team_data["agency_relationships"] = {}
        if "transfer_history" not in team_data:
            team_data["transfer_history"] = []
        if "market_trends" not in team_data:
            team_data["market_trends"] = {}

        team_data = youth_service._ensure_team_state(team_data)
        team_data = gm_service._ensure_gm_profile(int(team_id), team_data)
        team_data = gm_service._ensure_objectives(int(team_id), team_data)
        if "season_budget_start" not in team_data:
            team_data["season_budget_start"] = int(team_data.get("budget") or 0)

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
            data = generate_player(pos=pos, quality=quality, league_id=league_id)
            data["bio"]["pos"] = pos
            data["team_id"] = team_id
            if str(league_id).upper().startswith("NCAA"):
                data["contract_type"] = "scholarship"
            if agents:
                agent = random.choice(agents)
                agency = agency_map.get(agent["agency_id"])
                data["agent_id"] = agent["agent_id"]
                data["agency_id"] = agent["agency_id"]
                data["agent_name"] = agent["name"]
                data["agency_name"] = agency["name"] if agency else ""
            nationality = data["bio"].get("nationality", "ES")
            gender = (data.get("bio") or {}).get("gender")
            name = generate_name(nationality, used_names, gender=gender)
            player_id, _ = player_repo.create_player(conn, name=name, data=data, updated_at=now)
            tier = int(data.get("scout", {}).get("tier") or 3)
            age = (data.get("bio") or {}).get("age")
            try:
                age = int(age)
            except (TypeError, ValueError):
                age = 0
            if str(league_id).upper().startswith("NCAA"):
                contract_type = "scholarship"
            else:
                contract_type = "scholarship" if age and age < 18 else "pro"
            contract = create_contract_data(
                tier,
                team_budget,
                roster_size=roster_size,
                universe=universe,
                contract_type=contract_type,
            )
            _seed_contract(conn, player_id, team_id, contract)

    conn.commit()

    for team_id, *_ in teams:
        try:
            youth_service.advance_day(conn, int(team_id), seed_day, emit_events=False)
        except Exception:
            continue

    for league_id in league_ids:
        if not league_id:
            continue
        try:
            youth_service._ensure_prospect_pool(conn, league_id, target=80, current_date=seed_day)
        except Exception:
            continue

    competition_service.ensure_competitions(conn)
