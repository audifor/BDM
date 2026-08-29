from __future__ import annotations

import json
import random
import sqlite3
import time
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from ..repo import player_repo, contract_repo, gm_repo
from ..services import club_service
from ..services.generator_service import generate_player
from ..services.contract_factory import create_contract_data, apply_contract_type
from ..services.name_service import generate_name


DEFAULT_ACADEMY_SLOTS = 4
DEFAULT_SCOUTING_LEVEL = 2


def _parse_date(value: str | None) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except Exception:
        return None


def _iso(value: date) -> str:
    return value.isoformat()


def _get_team(conn: sqlite3.Connection, team_id: int) -> Optional[Dict[str, Any]]:
    row = conn.execute("SELECT id, data_json FROM team WHERE id = ?", (int(team_id),)).fetchone()
    if not row:
        return None
    return {"id": int(row["id"]), "data": json.loads(row["data_json"]) if row["data_json"] else {}}


def _academy_level(team_data: Dict[str, Any]) -> int:
    facilities = team_data.get("facilities") or {}
    try:
        level = int((facilities.get("youth_academy") or {}).get("level") or 0)
    except (TypeError, ValueError):
        level = 0
    return max(1, min(6, level or 1))


def _scouting_level(team_data: Dict[str, Any]) -> int:
    scouting = team_data.get("scouting") or {}
    try:
        level = int(scouting.get("level") or 0)
    except (TypeError, ValueError):
        level = 0
    facilities = team_data.get("facilities") or {}
    try:
        facility_level = int((facilities.get("scouting_network") or {}).get("level") or 0)
    except (TypeError, ValueError):
        facility_level = 0
    level = max(level, facility_level)
    if level <= 0:
        level = DEFAULT_SCOUTING_LEVEL
    return max(1, min(6, level))


def _scout_tier_for(team_data: Dict[str, Any]) -> int:
    level = _scouting_level(team_data)
    base = max(1, min(6, 7 - level))
    staff_perf = team_data.get("staff_performance") if isinstance(team_data.get("staff_performance"), dict) else {}
    by_dept = staff_perf.get("by_department") if isinstance(staff_perf.get("by_department"), dict) else {}
    perf = by_dept.get("SCOUTING") if by_dept else staff_perf.get("average")
    try:
        perf_val = float(perf) if perf is not None else None
    except (TypeError, ValueError):
        perf_val = None
    if perf_val is not None:
        if perf_val >= 70:
            base = max(1, base - 1)
        elif perf_val <= 40:
            base = min(6, base + 1)
    return int(base)


def _academy_slots(team_data: Dict[str, Any]) -> int:
    facilities = team_data.get("facilities") or {}
    bonuses = club_service.calculate_facility_bonuses(facilities) if facilities else {}
    slots_bonus = int(bonuses.get("academy_slots") or 0)
    slots = DEFAULT_ACADEMY_SLOTS + slots_bonus
    return max(2, min(24, int(slots)))


def _academy_quality(team_data: Dict[str, Any]) -> float:
    facilities = team_data.get("facilities") or {}
    bonuses = club_service.calculate_facility_bonuses(facilities) if facilities else {}
    youth_quality = float(bonuses.get("youth_quality") or 0.0)
    base = 0.75 + min(0.18, youth_quality)
    tier = int(team_data.get("tier") or 3)
    tier_shift = 0.06 if tier <= 1 else 0.0 if tier == 2 else -0.04
    return max(0.65, min(1.05, base + tier_shift))


def _ensure_team_state(team_data: Dict[str, Any]) -> Dict[str, Any]:
    cantera = team_data.get("cantera") if isinstance(team_data.get("cantera"), dict) else {}
    scouting = team_data.get("scouting") if isinstance(team_data.get("scouting"), dict) else {}

    if "activa" not in cantera:
        cantera["activa"] = True
    if "nivel" not in cantera:
        cantera["nivel"] = _academy_level(team_data)
    if "jugadores" not in cantera:
        cantera["jugadores"] = 0
    if "presupuesto" not in cantera:
        cantera["presupuesto"] = int(team_data.get("budget") or 0) * 0.05
    if "players" not in cantera:
        cantera["players"] = []

    if "nivel" not in scouting:
        scouting["nivel"] = _scouting_level(team_data)
    if "alcance" not in scouting:
        scouting["alcance"] = "regional"
    if "ojeadores" not in scouting:
        scouting["ojeadores"] = max(1, int(scouting.get("nivel") or DEFAULT_SCOUTING_LEVEL))

    team_data["cantera"] = cantera
    team_data["scouting"] = scouting
    return team_data


def _recalc_market(data: Dict[str, Any], league_id: str | None) -> None:
    attrs = data.get("attributes") or {}
    if not attrs:
        return
    overall = int(sum(attrs.values()) / len(attrs))
    age = int((data.get("bio") or {}).get("age") or 18)
    potential_bonus = max(0, (28 - age) * 15)
    potential = min(1000, overall + potential_bonus + random.randint(-30, 50))
    base_value = (overall / 1000) * 5_000_000
    potential_multiplier = 1 + ((potential - overall) / 1000)
    age_multiplier = 1.5 if age <= 23 else 1.2 if age <= 27 else 0.8 if age <= 32 else 0.5
    market_value = int(base_value * potential_multiplier * age_multiplier)
    if str(league_id or "").upper().startswith("NCAA"):
        market_value = int(market_value * 0.15)
    data["potential"] = potential
    data["market_value"] = market_value
    data.pop("overall", None)


def _create_youth_player(
    conn: sqlite3.Connection,
    team_id: int,
    league_id: str,
    quality: float,
    current_date: date,
) -> Dict[str, Any]:
    pos = random.choice(["PG", "SG", "SF", "PF", "C"])
    data = generate_player(pos=pos, quality=quality, league_id=league_id)
    age = random.randint(14, 18)
    data["bio"]["age"] = age
    data["league_id"] = league_id
    data["team_id"] = None
    data["academy_team_id"] = int(team_id)
    data["is_academy"] = True
    data["is_prospect"] = True
    data["scout_hidden"] = False
    data["academy"] = {"joined": _iso(current_date), "status": "academy"}
    registration = data.get("registration") if isinstance(data.get("registration"), dict) else {}
    registration.setdefault("homegrown_club", int(team_id))
    registration.setdefault("canterano", True)
    data["registration"] = registration
    _recalc_market(data, league_id)
    nationality = data.get("bio", {}).get("nationality", "ES")
    gender = data.get("bio", {}).get("gender")
    name = generate_name(nationality, gender=gender)
    player_id, row = player_repo.create_player(conn, name=name, data=data, updated_at=int(time.time()))
    return {"id": player_id, "name": name, "data": data}


def _ensure_prospect_pool(
    conn: sqlite3.Connection,
    league_id: str,
    target: int,
    current_date: date,
) -> int:
    league_key = str(league_id or "").upper()
    cur = conn.execute(
        "SELECT COUNT(1) FROM player WHERE json_extract(data_json, '$.league_id') = ? AND json_extract(data_json, '$.scout_hidden') = 1 AND json_extract(data_json, '$.team_id') IS NULL",
        (league_key,),
    ).fetchone()
    existing = int(cur[0]) if cur else 0
    needed = max(0, target - existing)
    created = 0
    for _ in range(needed):
        pos = random.choice(["PG", "SG", "SF", "PF", "C"])
        data = generate_player(pos=pos, quality=0.78, league_id=league_key)
        age = random.randint(14, 22)
        data["bio"]["age"] = age
        data["league_id"] = league_key
        data["team_id"] = None
        data["is_prospect"] = True
        data["scout_hidden"] = True
        data["prospect"] = {"origin": "scout_pool", "created": _iso(current_date)}
        _recalc_market(data, league_key)
        nationality = data.get("bio", {}).get("nationality", "ES")
        gender = data.get("bio", {}).get("gender")
        name = generate_name(nationality, gender=gender)
        player_repo.create_player(conn, name=name, data=data, updated_at=int(time.time()))
        created += 1
    return created


def _log_event(
    conn: sqlite3.Connection,
    team_id: int,
    title: str,
    body: str,
    event_date: str,
    kind: str = "youth",
) -> None:
    event = gm_repo.create_event(
        conn,
        team_id=int(team_id),
        event_type=kind,
        severity="info",
        state="open",
        title=title,
        body=body,
        event_date=event_date,
        data={"origin": "youth"},
    )
    try:
        from ..services import smartphone_service
        smartphone_service.create_content(
            conn,
            {
                "team_id": int(team_id),
                "content_type": "news",
                "data": {
                    "title": title,
                    "content": body,
                    "timestamp": event_date,
                    "type": kind,
                    "event_id": event.get("id"),
                },
            },
        )
    except Exception:
        pass


def _academy_player_rows(conn: sqlite3.Connection, player_ids: List[int]) -> Dict[int, Dict[str, Any]]:
    if not player_ids:
        return {}
    placeholders = ",".join("?" for _ in player_ids)
    rows = conn.execute(
        f"SELECT id, name, data_json FROM player WHERE id IN ({placeholders})",
        player_ids,
    ).fetchall()
    out = {}
    for row in rows:
        out[int(row["id"])] = {
            "id": int(row["id"]),
            "name": row["name"],
            "data": json.loads(row["data_json"]) if row["data_json"] else {},
        }
    return out


def _pick_ncaa_team(conn: sqlite3.Connection, gender: str) -> Optional[int]:
    league_key = "NCAA_W" if str(gender).upper() == "F" else "NCAA_M"
    rows = conn.execute(
        "SELECT id FROM team WHERE UPPER(json_extract(data_json, '$.league_id')) = ? ORDER BY id",
        (league_key,),
    ).fetchall()
    if not rows:
        return None
    return int(random.choice(rows)["id"])


def _create_scholarship_contract(conn: sqlite3.Connection, player_id: int, team_id: int, league_id: str) -> None:
    contract = create_contract_data(tier=3, team_budget=0, roster_size=12, universe="NCAA", contract_type="scholarship")
    contract = apply_contract_type(contract, "scholarship")
    contract_repo.create_contract(conn, player_id=int(player_id), team_id=int(team_id), data=contract, updated_at=int(time.time()))


def advance_day(
    conn: sqlite3.Connection,
    team_id: int,
    current_date: date,
    emit_events: bool = False,
) -> Dict[str, Any]:
    team = _get_team(conn, team_id)
    if not team:
        return {"ok": False, "error": "Team not found"}
    team_data = team.get("data") or {}
    team_data = _ensure_team_state(team_data)
    league_id = team_data.get("league_id") or team_data.get("league") or team_data.get("leagueId") or "ACB"
    league_key = str(league_id or "").upper()
    today = current_date
    today_str = _iso(today)

    cantera = team_data.get("cantera") or {}
    academy_ids = [int(pid) for pid in (cantera.get("players") or []) if pid]
    academy_map = _academy_player_rows(conn, academy_ids)
    academy_ids = [pid for pid in academy_ids if pid in academy_map]
    cantera["players"] = academy_ids

    academy_slots = _academy_slots(team_data)
    last_intake = _parse_date(str(cantera.get("last_intake") or ""))
    days_since = (today - last_intake).days if last_intake else 999
    should_intake = days_since >= 30 or today.day == 1
    added = 0
    added_names: List[str] = []
    academy_enabled = not league_key.startswith("NCAA")
    if academy_enabled and cantera.get("activa") and should_intake:
        missing = max(0, academy_slots - len(academy_ids))
        intake = min(missing, max(1, academy_slots // 4))
        quality = _academy_quality(team_data)
        for _ in range(intake):
            player = _create_youth_player(conn, int(team_id), league_key, quality, today)
            academy_ids.append(int(player["id"]))
            added += 1
            added_names.append(player["name"])
        if added:
            cantera["last_intake"] = today_str

    # NCAA poaching
    left_ncaa = 0
    left_names: List[str] = []
    if league_key in {"ACB", "FEB"}:
        updated_ids = []
        for pid in academy_ids:
            player = academy_map.get(pid)
            if not player:
                updated_ids.append(pid)
                continue
            pdata = player.get("data") or {}
            age = int((pdata.get("bio") or {}).get("age") or 0)
            if age < 18:
                updated_ids.append(pid)
                continue
            potential = int(pdata.get("potential") or 0)
            base_chance = 0.002 + (potential / 1000.0) * 0.01
            if today.month in {3, 4, 5}:
                base_chance *= 1.6
            rng = random.Random(f"{team_id}:{pid}:{today_str}:ncaa")
            if rng.random() < base_chance:
                ncaa_team_id = _pick_ncaa_team(conn, (pdata.get("bio") or {}).get("gender") or "M")
                if ncaa_team_id:
                    pdata["team_id"] = int(ncaa_team_id)
                    pdata["league_id"] = "NCAA_W" if (pdata.get("bio") or {}).get("gender") == "F" else "NCAA_M"
                    pdata["academy_team_id"] = None
                    pdata["is_academy"] = False
                    pdata["contract_type"] = "scholarship"
                    conn.execute(
                        "UPDATE player SET data_json = ?, updated_at = ? WHERE id = ?",
                        (json.dumps(pdata, ensure_ascii=True), int(time.time()), int(pid)),
                    )
                    _create_scholarship_contract(conn, int(pid), int(ncaa_team_id), str(pdata.get("league_id")))
                    left_ncaa += 1
                    left_names.append(player.get("name") or "Jugador")
                else:
                    updated_ids.append(pid)
            else:
                updated_ids.append(pid)
        academy_ids = updated_ids
        cantera["players"] = academy_ids

    # Scouting discovery
    scout_reports = 0
    prospects_created = 0
    scouting_level = _scouting_level(team_data)
    scout_tier = _scout_tier_for(team_data)
    facilities = team_data.get("facilities") or {}
    bonuses = club_service.calculate_facility_bonuses(facilities) if facilities else {}
    scout_slots = int(bonuses.get("scout_slots") or 0)
    daily_reports = max(1, min(4, int(max(1, scout_slots // 2) or 1)))
    if random.random() < (0.35 + scouting_level * 0.05):
        prospects_created = _ensure_prospect_pool(conn, league_key, target=60, current_date=today)
        # pick hidden prospects not yet reported
        rows = conn.execute(
            "SELECT id FROM player WHERE json_extract(data_json, '$.league_id') = ? AND json_extract(data_json, '$.scout_hidden') = 1",
            (league_key,),
        ).fetchall()
        ids = [int(r["id"]) for r in rows]
        rng = random.Random(f"{team_id}:{today_str}:scout")
        rng.shuffle(ids)
        for pid in ids[:daily_reports]:
            cur = conn.execute(
                "SELECT 1 FROM scout_report WHERE team_id = ? AND player_id = ? LIMIT 1",
                (int(team_id), int(pid)),
            ).fetchone()
            if cur:
                continue
            conn.execute(
                "INSERT INTO scout_report (player_id, team_id, scout_id, created_at, expires_at, accuracy, data_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    int(pid),
                    int(team_id),
                    None,
                    int(time.time()),
                    int(time.time()) + (90 * 24 * 60 * 60),
                    max(50, 110 - (scout_tier * 10)),
                    json.dumps(
                        {
                            "tier": scout_tier,
                            "accuracy": max(50, 110 - (scout_tier * 10)),
                            "assigned_at": today_str,
                            "notes": "auto_discovery",
                        },
                        ensure_ascii=True,
                    ),
                ),
            )
            scout_reports += 1
        if scout_reports:
            conn.commit()

    cantera["jugadores"] = len(academy_ids)
    team_data["cantera"] = cantera
    team_data["scouting"] = team_data.get("scouting") or {}

    conn.execute(
        "UPDATE team SET data_json = ?, updated_at = ? WHERE id = ?",
        (json.dumps(team_data, ensure_ascii=True), int(time.time()), int(team_id)),
    )
    conn.commit()

    if emit_events:
        if added:
            sample = ", ".join(added_names[:3]) + ("..." if len(added_names) > 3 else "")
            _log_event(
                conn,
                int(team_id),
                "Nueva generacion de cantera",
                f"Se incorporan {added} jugadores a la cantera. {sample}",
                today_str,
                kind="academy",
            )
        if left_ncaa:
            sample = ", ".join(left_names[:3]) + ("..." if len(left_names) > 3 else "")
            _log_event(
                conn,
                int(team_id),
                "Salida a NCAA",
                f"{left_ncaa} canteranos eligen NCAA: {sample}",
                today_str,
                kind="youth",
            )
        if scout_reports:
            _log_event(
                conn,
                int(team_id),
                "Informe de scouting",
                f"El scouting descubre {scout_reports} nuevos prospectos.",
                today_str,
                kind="scouting",
            )

    return {
        "ok": True,
        "academy_added": added,
        "academy_left": left_ncaa,
        "academy_count": len(academy_ids),
        "scout_reports": scout_reports,
        "prospects_created": prospects_created,
    }


def promote_player(conn: sqlite3.Connection, team_id: int, player_id: int) -> Dict[str, Any]:
    team = _get_team(conn, team_id)
    if not team:
        return {"ok": False, "error": "Team not found"}
    row = conn.execute("SELECT id, name, data_json FROM player WHERE id = ?", (int(player_id),)).fetchone()
    if not row:
        return {"ok": False, "error": "Player not found"}
    data = json.loads(row["data_json"]) if row["data_json"] else {}
    academy_team_id = data.get("academy_team_id")
    if academy_team_id and str(academy_team_id) != str(team_id):
        return {"ok": False, "error": "Player not in academy"}
    data["team_id"] = int(team_id)
    data["academy_team_id"] = None
    data["is_academy"] = False
    data["contract_type"] = "scholarship" if int((data.get("bio") or {}).get("age") or 0) < 18 else "pro"
    registration = data.get("registration") if isinstance(data.get("registration"), dict) else {}
    registration.setdefault("homegrown_club", int(team_id))
    registration.setdefault("canterano", True)
    data["registration"] = registration
    conn.execute(
        "UPDATE player SET data_json = ?, updated_at = ? WHERE id = ?",
        (json.dumps(data, ensure_ascii=True), int(time.time()), int(player_id)),
    )
    contract = create_contract_data(tier=3, team_budget=int(team.get("data", {}).get("budget") or 0), roster_size=int(team.get("data", {}).get("roster_size") or 12))
    contract = apply_contract_type(contract, data.get("contract_type"))
    contract_repo.create_contract(conn, player_id=int(player_id), team_id=int(team_id), data=contract, updated_at=int(time.time()))
    team_data = team.get("data") or {}
    cantera = team_data.get("cantera") if isinstance(team_data.get("cantera"), dict) else {}
    players = [pid for pid in cantera.get("players") or [] if int(pid) != int(player_id)]
    cantera["players"] = players
    team_data["cantera"] = cantera
    team_data["youth_promoted"] = int(team_data.get("youth_promoted") or 0) + 1
    conn.execute(
        "UPDATE team SET data_json = ?, updated_at = ? WHERE id = ?",
        (json.dumps(team_data, ensure_ascii=True), int(time.time()), int(team_id)),
    )
    conn.commit()
    return {"ok": True}
