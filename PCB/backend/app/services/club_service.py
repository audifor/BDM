from __future__ import annotations

import json
import random
import sqlite3
import time
from typing import Any, Dict, Tuple

from . import rules_service


def _facility_catalog() -> Dict[str, Any]:
    return rules_service.facilities_catalog()


def _facility_by_id() -> Dict[str, Dict[str, Any]]:
    catalog = _facility_catalog()
    facilities = catalog.get("facilities") or []
    return {str(item.get("id")): item for item in facilities if item.get("id")}


def calculate_facility_bonuses(facilities: Dict[str, Any]) -> Dict[str, float]:
    """Calculate total bonuses from all facility levels."""
    effects_map = _facility_by_id()
    bonuses = {}
    for facility_id, facility_data in facilities.items():
        level = facility_data.get("level", 0)
        if level == 0:
            continue

        effects = effects_map.get(str(facility_id), {}).get("effects") or {}
        for effect_key, base_value in effects.items():
            bonus = base_value * level
            bonuses[effect_key] = bonuses.get(effect_key, 0) + bonus

    return bonuses


def calculate_facility_upkeep(facilities: Dict[str, Any]) -> int:
    """Calculate daily upkeep cost for facilities."""
    catalog = _facility_by_id()
    total = 0.0
    for facility_id, facility_data in facilities.items():
        level = int(facility_data.get("level", 0) or 0)
        if level <= 0:
            continue
        facility = catalog.get(str(facility_id))
        if not facility:
            continue
        base = float(facility.get("base_cost") or 0.0)
        if base <= 0:
            continue
        upkeep = base * 0.0015 * level
        total += upkeep
    return int(round(total))


def _avg(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / max(1, len(values))


_DEPT_HINTS = {
    "COACHING": {
        "prefixes": ["off_", "def_", "tactical_", "video_"],
        "keys": ["game_mgmt", "rotation_logic", "shot_selection_opt", "tactical_intel", "tactical_prep"],
    },
    "PLAYER_DEV": {
        "prefixes": ["dev_", "psy_", "off_teach_", "def_teach_"],
        "keys": ["work_ethic", "load_mgmt", "prospect", "veteran"],
    },
    "SCOUTING": {"prefixes": ["sct_"], "keys": []},
    "MEDICAL": {"prefixes": ["med_"], "keys": []},
    "FRONT_OFFICE": {
        "prefixes": ["fin_", "logistics_"],
        "keys": ["staff_harmony", "owner", "contract", "cap", "trade", "value"],
    },
    "SUPPORT_TECH": {"prefixes": ["video_", "tactical_", "analytics"], "keys": []},
}


def _collect_attr_values(attrs: Dict[str, Any], prefixes: list[str], keys: list[str]) -> list[float]:
    values: list[float] = []
    for key, value in (attrs or {}).items():
        if prefixes and any(str(key).startswith(prefix) for prefix in prefixes):
            try:
                values.append(float(value))
            except (TypeError, ValueError):
                continue
        if keys and key in keys:
            try:
                values.append(float(value))
            except (TypeError, ValueError):
                continue
    return values


def _staff_member_performance(member: Dict[str, Any], rng: random.Random) -> float:
    attrs = member.get("attributes") or {}
    if not isinstance(attrs, dict) or not attrs:
        return 50.0
    base_values: list[float] = []
    for value in attrs.values():
        try:
            base_values.append(float(value))
        except (TypeError, ValueError):
            continue
    if not base_values:
        return 50.0
    base_avg = _avg(base_values)
    dept = str(member.get("department") or "").upper()
    hints = _DEPT_HINTS.get(dept, {})
    dept_values = _collect_attr_values(attrs, hints.get("prefixes", []), hints.get("keys", []))
    dept_avg = _avg(dept_values) if dept_values else base_avg
    exp_years = member.get("experience_years") or 0
    try:
        exp_years = float(exp_years)
    except (TypeError, ValueError):
        exp_years = 0.0
    experience = min(10.0, exp_years * 0.4)
    perf = ((base_avg * 0.6) + (dept_avg * 0.4)) / 10.0 + experience
    perf += rng.uniform(-3.5, 3.5)
    return max(0.0, min(100.0, perf))


def refresh_staff_performance(team_id: int, team_data: Dict[str, Any], day: str | None) -> Dict[str, Any]:
    if not team_id or not day:
        return {"updated": False, "summary": team_data.get("staff_performance") or {}}
    summary = team_data.get("staff_performance") if isinstance(team_data.get("staff_performance"), dict) else {}
    if summary.get("updated") == day:
        return {"updated": False, "summary": summary}
    staff_list = team_data.get("staff") if isinstance(team_data.get("staff"), list) else []
    if not staff_list:
        summary = {"average": 0, "by_department": {}, "trend": 0, "updated": day}
        team_data["staff_performance"] = summary
        return {"updated": True, "summary": summary}

    dept_map: Dict[str, list[float]] = {}
    perf_values: list[float] = []
    for idx, member in enumerate(staff_list):
        member_rng = random.Random(f"{team_id}:{day}:{idx}")
        perf = _staff_member_performance(member, member_rng)
        prev = member.get("performance")
        try:
            prev_val = float(prev) if prev is not None else None
        except (TypeError, ValueError):
            prev_val = None
        member["performance"] = round(perf, 2)
        member["performance_trend"] = round(perf - prev_val, 2) if prev_val is not None else 0
        member["performance_updated"] = day
        dept = str(member.get("department") or "").upper()
        dept_map.setdefault(dept or "GENERAL", []).append(perf)
        perf_values.append(perf)

    avg_perf = _avg(perf_values)
    prev_avg = summary.get("average")
    try:
        prev_avg_val = float(prev_avg) if prev_avg is not None else None
    except (TypeError, ValueError):
        prev_avg_val = None
    by_department = {dept: round(_avg(values), 2) for dept, values in dept_map.items()}
    summary = {
        "average": round(avg_perf, 2),
        "by_department": by_department,
        "trend": round(avg_perf - prev_avg_val, 2) if prev_avg_val is not None else 0,
        "updated": day,
    }
    team_data["staff"] = staff_list
    team_data["staff_performance"] = summary
    return {"updated": True, "summary": summary}


def apply_facility_upkeep(team_data: Dict[str, Any], day: str | None) -> int:
    if not day:
        return 0
    if team_data.get("last_facility_upkeep") == day:
        return 0
    facilities = team_data.get("facilities") or {}
    cost = calculate_facility_upkeep(facilities) if facilities else 0
    if cost:
        budget = int(team_data.get("budget") or 0)
        team_data["budget"] = budget - int(cost)
    team_data["last_facility_upkeep"] = day
    team_data["facility_upkeep_daily"] = int(cost)
    return int(cost)


def _upgrade_cost(facility: Dict[str, Any], level: int) -> int:
    base = float(facility.get("base_cost") or 0)
    multiplier = float(facility.get("cost_multiplier") or 1)
    return int(round(base * (multiplier ** level)))


def _resolve_budget_and_level(team_data: Dict[str, Any]) -> Tuple[float, int]:
    budget = team_data.get("budget")
    if budget is None:
        budget = (team_data.get("finances") or {}).get("budget") or 0
    level = team_data.get("level") or team_data.get("club_level") or 1
    return float(budget or 0), int(level or 1)


def upgrade_facility(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Upgrade a club facility."""
    team_id = payload.get("team_id")
    facility_id = payload.get("facility_id")

    if not team_id or not facility_id:
        return {"ok": False, "error": {"message": "team_id and facility_id required"}}

    # Get team
    row = conn.execute("SELECT id, data_json FROM team WHERE id = ?", (team_id,)).fetchone()
    if not row:
        return {"ok": False, "error": {"message": "Team not found"}}

    data = json.loads(row[1] or "{}")
    facilities = data.get("facilities") or {}

    facility_key = str(facility_id)
    catalog_map = _facility_by_id()
    facility = catalog_map.get(facility_key)
    if not facility:
        return {"ok": False, "error": {"message": "Facility not found"}}

    # Get current level
    current_level = int(facilities.get(facility_key, {}).get("level", 0))
    max_level = int(facility.get("max_level") or 0)
    if max_level and current_level >= max_level:
        return {"ok": False, "error": {"message": "Facility already at max level"}}

    budget, club_level = _resolve_budget_and_level(data)
    required_club_level = (current_level // 2) + 1
    if required_club_level > club_level:
        return {"ok": False, "error": {"message": "Club level too low"}}

    upgrade_cost = _upgrade_cost(facility, current_level)
    if budget < upgrade_cost:
        return {"ok": False, "error": {"message": "Insufficient budget"}}

    new_level = current_level + 1

    if facility_key not in facilities:
        facilities[facility_key] = {}

    facilities[facility_key]["level"] = new_level
    facilities[facility_key]["upgraded_at"] = int(time.time())

    data["facilities"] = facilities
    data["budget"] = max(0, budget - upgrade_cost)

    conn.execute("UPDATE team SET data_json = ? WHERE id = ?", (json.dumps(data), team_id))
    conn.commit()

    return {"ok": True, "facility_id": facility_key, "level": new_level, "cost": upgrade_cost}


def assign_staff_role(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Assign staff member to a functional role."""
    team_id = payload.get("team_id")
    role_id = payload.get("role_id")
    staff_id = payload.get("staff_id")
    remove_staff_id = payload.get("remove_staff_id")

    if not team_id or not role_id:
        return {"ok": False, "error": {"message": "team_id and role_id required"}}

    # Get team
    row = conn.execute("SELECT id, data_json FROM team WHERE id = ?", (team_id,)).fetchone()
    if not row:
        return {"ok": False, "error": {"message": "Team not found"}}

    data = json.loads(row[1] or "{}")
    staff_assignments = data.get("staff_assignments") or {}

    # Remove old assignment if specified
    if remove_staff_id:
        if str(remove_staff_id) in staff_assignments:
            del staff_assignments[str(remove_staff_id)]

    # Add new assignment
    if staff_id:
        staff_assignments[str(staff_id)] = {
            "role": role_id,
            "assigned_at": int(time.time()),
            "staff_id": staff_id,
        }

    data["staff_assignments"] = staff_assignments

    conn.execute("UPDATE team SET data_json = ? WHERE id = ?", (json.dumps(data), team_id))
    conn.commit()

    return {"ok": True, "role_id": role_id, "staff_id": staff_id}


def assign_player_to_coach(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Assign a player to a development coach."""
    team_id = payload.get("team_id")
    player_id = payload.get("player_id")
    coach_id = payload.get("coach_id")

    if not team_id or not player_id:
        return {"ok": False, "error": {"message": "team_id and player_id required"}}

    # Update player data
    row = conn.execute("SELECT id, data_json FROM player WHERE id = ?", (player_id,)).fetchone()
    if not row:
        return {"ok": False, "error": {"message": "Player not found"}}

    data = json.loads(row[1] or "{}")
    data["assigned_coach"] = coach_id

    conn.execute("UPDATE player SET data_json = ? WHERE id = ?", (json.dumps(data), player_id))
    conn.commit()

    return {"ok": True, "player_id": player_id, "coach_id": coach_id}


def hire_staff(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Hire new staff member for a role."""
    team_id = payload.get("team_id")
    role_id = payload.get("role_id")

    if not team_id or not role_id:
        return {"ok": False, "error": {"message": "team_id and role_id required"}}

    # Not implemented yet
    return {"ok": False, "error": {"message": "Staff hiring not implemented"}}


def negotiate_objectives(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Attempt to negotiate board objectives."""
    team_id = payload.get("team_id")

    if not team_id:
        return {"ok": False, "error": {"message": "team_id required"}}

    # Get team
    row = conn.execute("SELECT id, data_json FROM team WHERE id = ?", (team_id,)).fetchone()
    if not row:
        return {"ok": False, "error": {"message": "Team not found"}}

    data = json.loads(row[1] or "{}")
    confidence = data.get("board_confidence", 70)

    # Calculate success probability
    if confidence >= 85:
        success_chance = 0.8
    elif confidence >= 70:
        success_chance = 0.6
    elif confidence >= 55:
        success_chance = 0.4
    else:
        success_chance = 0.2

    import random
    success = random.random() < success_chance

    if success:
        objectives = data.get("objectives") if isinstance(data.get("objectives"), dict) else {}
        catalog = rules_service.board_objectives_catalog() or {}
        catalog_by_id = {obj.get("id"): obj for obj in (catalog.get("objectives") or [])}

        def downgrade(obj_id: str) -> str:
            downgrade_map = {
                "league_champion": "league_top3",
                "league_top3": "league_playoffs",
            }
            return downgrade_map.get(obj_id, obj_id)

        updated = {}
        for key, obj in objectives.items():
            obj_id = str(obj.get("id") or "")
            next_id = downgrade(obj_id)
            defn = catalog_by_id.get(next_id) or catalog_by_id.get(obj_id)
            if defn:
                updated[key] = {
                    "id": defn.get("id"),
                    "name": defn.get("name"),
                    "threshold": defn.get("threshold"),
                    "type": defn.get("type"),
                }
            else:
                updated[key] = obj
        if updated:
            data["objectives"] = updated
        data["objectives_negotiated"] = True
        data["board_confidence"] = max(0, confidence - 5)  # Small confidence hit
        conn.execute("UPDATE team SET data_json = ? WHERE id = ?", (json.dumps(data), team_id))
        conn.commit()
        return {"ok": True, "success": True, "message": "Objetivos negociados exitosamente"}
    else:
        data["board_confidence"] = max(0, confidence - 10)  # Bigger hit for failed negotiation
        conn.execute("UPDATE team SET data_json = ? WHERE id = ?", (json.dumps(data), team_id))
        conn.commit()
        return {"ok": True, "success": False, "message": "La directiva rechazó la negociación"}


def get_facility_bonuses(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Get calculated facility bonuses for a team."""
    team_id = payload.get("team_id")

    if not team_id:
        return {"ok": False, "error": {"message": "team_id required"}}

    # Get team
    row = conn.execute("SELECT id, data_json FROM team WHERE id = ?", (team_id,)).fetchone()
    if not row:
        return {"ok": False, "error": {"message": "Team not found"}}

    data = json.loads(row[1] or "{}")
    facilities = data.get("facilities") or {}

    bonuses = calculate_facility_bonuses(facilities)

    return {"ok": True, "bonuses": bonuses}
