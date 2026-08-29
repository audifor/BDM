from __future__ import annotations

import json
import random
import sqlite3
import time
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from . import gm_service, club_service


TRAINING_GROUPS = {
    "strength": ["strength_static", "strength_explo", "contact_finishing", "box_out", "def_post"],
    "stamina": ["stamina", "fatigue_recov", "speed_top", "acceleration"],
    "vertical": ["vert_static", "vert_run", "second_jump", "reb_def", "block"],
    "shooting": ["mid_range", "three_static", "three_off_dribble", "free_throw", "off_screen_shot"],
    "handling": ["ball_control", "ball_protect", "off_hand_dribble", "crossover", "speed_ball"],
    "technique": ["court_vision", "pass_short", "pass_long", "pass_bounce", "pass_post", "shot_selection"],
    "defense": ["def_perimeter", "def_post", "help_defense", "screen_nav", "steal_onball"],
}

FACILITY_GROUP_MAP = {
    "strength_dev": "strength",
    "stamina_dev": "stamina",
    "vertical_dev": "vertical",
    "shooting_dev": "shooting",
    "handling_dev": "handling",
    "technique_dev": "technique",
}


def _staff_dev_factor(team_data: Dict[str, Any]) -> float:
    staff = team_data.get("staff") if isinstance(team_data.get("staff"), list) else []
    if not staff:
        return 1.0
    values: List[float] = []
    for member in staff:
        attrs = member.get("attributes") or {}
        if not isinstance(attrs, dict):
            continue
        for key, value in attrs.items():
            if str(key).startswith("dev_"):
                try:
                    values.append(float(value))
                except (TypeError, ValueError):
                    continue
    if not values:
        return 1.0
    avg = sum(values) / max(1, len(values))
    base = 0.9 + (avg / 1000.0) * 0.3
    perf = None
    staff_perf = team_data.get("staff_performance")
    if isinstance(staff_perf, dict):
        by_dept = staff_perf.get("by_department") if isinstance(staff_perf.get("by_department"), dict) else {}
        perf = by_dept.get("PLAYER_DEV") if by_dept else staff_perf.get("average")
    try:
        perf_val = float(perf) if perf is not None else None
    except (TypeError, ValueError):
        perf_val = None
    if perf_val is None:
        return base
    perf_mult = 0.85 + (perf_val / 100.0) * 0.3
    return base * perf_mult


def _medical_perf(team_data: Dict[str, Any]) -> Optional[float]:
    staff_perf = team_data.get("staff_performance")
    if isinstance(staff_perf, dict):
        by_dept = staff_perf.get("by_department") if isinstance(staff_perf.get("by_department"), dict) else {}
        perf = by_dept.get("MEDICAL") if by_dept else staff_perf.get("average")
        try:
            return float(perf)
        except (TypeError, ValueError):
            pass
    staff = team_data.get("staff") if isinstance(team_data.get("staff"), list) else []
    if not staff:
        return None
    values: List[float] = []
    for member in staff:
        if str(member.get("department") or "").upper() != "MEDICAL":
            continue
        attrs = member.get("attributes") or {}
        if not isinstance(attrs, dict):
            continue
        med_vals = []
        for key, value in attrs.items():
            if str(key).startswith("med_"):
                try:
                    med_vals.append(float(value))
                except (TypeError, ValueError):
                    continue
        if med_vals:
            values.append(sum(med_vals) / len(med_vals))
        else:
            try:
                values.append(sum(float(v) for v in attrs.values()) / max(1, len(attrs)))
            except Exception:
                continue
    if not values:
        return None
    return sum(values) / max(1, len(values)) / 10.0


def _medical_modifiers(team_data: Dict[str, Any]) -> tuple[float, float]:
    perf = _medical_perf(team_data)
    if perf is None:
        return 0.0, 0.0
    prevention = max(-0.08, min(0.08, (perf - 50.0) / 625.0))
    recovery = max(-0.1, min(0.1, (perf - 50.0) / 500.0))
    return prevention, recovery


def _apply_recovery_days(days_out: int, facility_recovery: float, medical_recovery: float) -> int:
    try:
        facility_recovery = float(facility_recovery)
    except (TypeError, ValueError):
        facility_recovery = 0.0
    try:
        medical_recovery = float(medical_recovery)
    except (TypeError, ValueError):
        medical_recovery = 0.0
    factor = 1.0 + facility_recovery - medical_recovery
    factor = _clamp(factor, 0.7, 1.3)
    return max(1, int(round(days_out * factor)))


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _parse_date(value: str | None) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except Exception:
        return None


def _iso(value: date) -> str:
    return value.isoformat()


def _attr(player_data: Dict[str, Any], key: str, default: int = 500) -> int:
    return int(player_data.get("attributes", {}).get(key, default))


def _ensure_health(data: Dict[str, Any]) -> Dict[str, Any]:
    health = data.get("health")
    if not isinstance(health, dict):
        health = {}
    if "fatigue" not in health:
        health["fatigue"] = 0
    if "injury_status" not in health:
        health["injury_status"] = "healthy"
    data["health"] = health
    if "morale" not in data:
        data["morale"] = 50
    return data


def _update_player(conn: sqlite3.Connection, player_id: int, data: Dict[str, Any]) -> None:
    conn.execute(
        "UPDATE player SET data_json = ?, updated_at = ? WHERE id = ?",
        (json.dumps(data, ensure_ascii=True), int(time.time()), int(player_id)),
    )


def _pick_injury_label(source: str, severity: str) -> str:
    source = str(source or "").lower()
    severity = str(severity or "").lower()
    training_labels = {
        "minor": ["Sobrecarga leve", "Molestias musculares", "Fatiga aguda"],
        "moderate": ["Distension muscular", "Contractura", "Tendinitis"],
        "severe": ["Rotura muscular", "Esguince severo", "Fractura por estres"],
    }
    match_labels = {
        "minor": ["Golpe leve", "Contusion", "Molestias en el tobillo"],
        "moderate": ["Esguince", "Dolor lumbar", "Lesion muscular"],
        "severe": ["Rotura de ligamentos", "Fractura", "Rotura grave"],
    }
    table = training_labels if source == "training" else match_labels
    options = table.get(severity) or ["Lesion"]
    return random.choice(options)


def _severity_from_rng(rng: random.Random, chance: float) -> str:
    roll = rng.random()
    if chance >= 0.08:
        if roll < 0.5:
            return "moderate"
        return "severe"
    if roll < 0.65:
        return "minor"
    if roll < 0.9:
        return "moderate"
    return "severe"


def _days_for_severity(rng: random.Random, severity: str) -> int:
    if severity == "minor":
        return rng.randint(3, 7)
    if severity == "moderate":
        return rng.randint(7, 21)
    return rng.randint(21, 60)


def _injury_status_for_severity(severity: str) -> str:
    if severity == "minor":
        return "questionable"
    return "out"


def _create_injury(
    conn: sqlite3.Connection,
    player_id: int,
    team_id: int | None,
    start: date,
    severity: str,
    label: str,
    source: str,
    days_out: int,
) -> Dict[str, Any]:
    end = start + timedelta(days=max(1, int(days_out)))
    data = {
        "label": label,
        "source": source,
        "days": int(days_out),
        "created_at": int(time.time()),
    }
    cur = conn.execute(
        "INSERT INTO injury (player_id, team_id, start_date, end_date, status, severity, data_json) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            int(player_id),
            int(team_id) if team_id else None,
            _iso(start),
            _iso(end),
            "active",
            severity,
            json.dumps(data, ensure_ascii=True),
        ),
    )
    return {
        "id": int(cur.lastrowid),
        "player_id": int(player_id),
        "team_id": int(team_id) if team_id else None,
        "start_date": _iso(start),
        "end_date": _iso(end),
        "status": "active",
        "severity": severity,
        "label": label,
        "source": source,
        "days": int(days_out),
    }


def _append_injury_history(health: Dict[str, Any], injury: Dict[str, Any]) -> None:
    history = health.get("injury_history")
    if not isinstance(history, list):
        history = []
    entry = {
        "id": injury.get("id"),
        "label": injury.get("label"),
        "severity": injury.get("severity"),
        "source": injury.get("source"),
        "start_date": injury.get("start_date"),
        "end_date": injury.get("end_date"),
        "days": injury.get("days"),
    }
    history.append(entry)
    health["injury_history"] = history[-20:]


def advance_team_injuries(conn: sqlite3.Connection, team_id: int, current_date: date) -> Dict[str, Any]:
    rows = conn.execute(
        "SELECT id, data_json FROM player WHERE json_extract(data_json, '$.team_id') = ?",
        (int(team_id),),
    ).fetchall()
    recovered: List[int] = []
    for row in rows:
        data = json.loads(row["data_json"]) if row["data_json"] else {}
        _ensure_health(data)
        health = data.get("health") or {}
        status = str(health.get("injury_status") or "healthy").lower()
        end_date = _parse_date(str(health.get("injury_end") or ""))
        if status in {"out", "questionable", "probable"} and end_date:
            if current_date >= end_date:
                health["injury_status"] = "healthy"
                health.pop("injury", None)
                health.pop("injury_end", None)
                health.pop("injury_start", None)
                health.pop("injury_days", None)
                data["health"] = health
                _update_player(conn, int(row["id"]), data)
                recovered.append(int(row["id"]))
            else:
                days_left = max(1, (end_date - current_date).days)
                health["injury_days"] = days_left
                data["health"] = health
                _update_player(conn, int(row["id"]), data)
    if recovered:
        conn.execute(
            "UPDATE injury SET status = ? WHERE player_id IN ({}) AND status = ?".format(
                ",".join("?" for _ in recovered)
            ),
            ["recovered", *recovered, "active"],
        )
    conn.commit()
    return {"recovered": recovered}


def apply_training_day(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    team_id = payload.get("team_id")
    if not team_id:
        return {"ok": False, "error": "team_id required"}

    date_str = str(payload.get("date") or "")
    current_date = _parse_date(date_str) or date.today()
    if not date_str:
        date_str = _iso(current_date)

    team_row = conn.execute("SELECT data_json FROM team WHERE id = ?", (int(team_id),)).fetchone()
    team_data = json.loads(team_row["data_json"]) if team_row and team_row["data_json"] else {}
    facilities = team_data.get("facilities") or {}
    facility_bonuses = club_service.calculate_facility_bonuses(facilities) if facilities else {}
    training_eff = 1.0 + float(facility_bonuses.get("training_efficiency") or 0.0)
    staff_dev = _staff_dev_factor(team_data)
    youth_bonus = float(facility_bonuses.get("youth_dev_speed") or 0.0)
    injury_prevention = float(facility_bonuses.get("injury_prevention") or 0.0)
    injury_recovery = float(facility_bonuses.get("injury_recovery") or 0.0)
    fatigue_recovery = float(facility_bonuses.get("fatigue_recovery") or 0.0)
    medical_prev, medical_rec = _medical_modifiers(team_data)
    injury_prevention = _clamp(injury_prevention + medical_prev, -0.15, 0.3)
    fatigue_recovery = _clamp(fatigue_recovery + medical_rec * 0.5, -0.1, 0.35)

    load_score = float(payload.get("load") or 0)
    session_count = int(payload.get("session_count") or 0)
    max_rpe = float(payload.get("max_rpe") or 0)
    rest_day = bool(payload.get("rest_day")) or session_count == 0

    advance_team_injuries(conn, int(team_id), current_date)

    rows = conn.execute(
        "SELECT id, name, data_json FROM player WHERE json_extract(data_json, '$.team_id') = ?",
        (int(team_id),),
    ).fetchall()
    injuries: List[Dict[str, Any]] = []
    updated = 0
    for row in rows:
        player_id = int(row["id"])
        data = json.loads(row["data_json"]) if row["data_json"] else {}
        _ensure_health(data)
        health = data.get("health") or {}
        if health.get("last_training_date") == date_str:
            continue

        fatigue = float(health.get("fatigue") or 0)
        recov = _attr(data, "fatigue_recov", 500) / 1000.0
        durability = _attr(data, "durability", 500) / 1000.0
        recovery_bonus = recov * 8.0 * (1.0 + fatigue_recovery)
        rest_bonus = 8.0 if rest_day else 0.0
        load_component = load_score * (0.7 + (max_rpe / 10.0) * 0.1)
        fatigue = _clamp(fatigue + load_component - recovery_bonus - rest_bonus, 0.0, 100.0)
        health["fatigue"] = round(fatigue, 2)
        health["last_training_date"] = date_str

        injury_status = str(health.get("injury_status") or "healthy").lower()
        if session_count > 0 and injury_status == "healthy":
            base = 0.002 + (load_score * 0.0005) + (fatigue * 0.0007)
            durability_penalty = (1.0 - durability) * 0.006
            chance = _clamp(base + durability_penalty, 0.001, 0.08)
            if injury_prevention != 0:
                chance = _clamp(chance * (1.0 - injury_prevention), 0.001, 0.08)
            rng = random.Random(f"{team_id}:{player_id}:{date_str}:training")
            if rng.random() < chance:
                severity = _severity_from_rng(rng, chance)
                days_out = _days_for_severity(rng, severity)
                days_out = _apply_recovery_days(days_out, injury_recovery, medical_rec)
                label = _pick_injury_label("training", severity)
                injury = _create_injury(
                    conn,
                    player_id=player_id,
                    team_id=int(team_id),
                    start=current_date,
                    severity=severity,
                    label=label,
                    source="training",
                    days_out=days_out,
                )
                health["injury_status"] = _injury_status_for_severity(severity)
                health["injury_start"] = _iso(current_date)
                health["injury_end"] = injury["end_date"]
                health["injury_days"] = days_out
                health["injury"] = injury
                _append_injury_history(health, injury)
                injuries.append(injury)

        if session_count > 0 and injury_status == "healthy":
            attrs = data.get("attributes") or {}
            if isinstance(attrs, dict) and attrs:
                age_raw = (data.get("bio") or {}).get("age")
                try:
                    age = int(age_raw)
                except (TypeError, ValueError):
                    age = 24
                age_factor = 1.15 if age <= 20 else 1.05 if age <= 24 else 0.95 if age <= 28 else 0.75 if age <= 32 else 0.5
                if age <= 22 and youth_bonus > 0:
                    age_factor *= (1.0 + youth_bonus)
                work_ethic = _attr(data, "work_ethic", 500) / 1000.0
                effort = 0.6 + work_ethic * 0.8
                load_factor = 0.45 + min(1.0, load_score / 85.0)
                base_gain = 0.18 * training_eff * staff_dev * age_factor * effort * load_factor
                base_gain = max(0.02, min(base_gain, 1.2))

                weights = {}
                for key in TRAINING_GROUPS:
                    weights[key] = 1.0
                for effect_key, group_key in FACILITY_GROUP_MAP.items():
                    bonus = float(facility_bonuses.get(effect_key) or 0.0)
                    if bonus > 0:
                        weights[group_key] = weights.get(group_key, 1.0) + bonus * 10.0

                group_names = list(weights.keys())
                total_weight = sum(weights.values())
                rng = random.Random(f"{team_id}:{player_id}:{date_str}:dev")
                targets = 2 if load_score >= 35 else 1
                for _ in range(targets):
                    pick = rng.random() * total_weight if total_weight > 0 else 0
                    chosen = group_names[0]
                    running = 0.0
                    for g in group_names:
                        running += weights.get(g, 0.0)
                        if pick <= running:
                            chosen = g
                            break
                    group = TRAINING_GROUPS.get(chosen) or []
                    if not group:
                        continue
                    attr_key = rng.choice(group)
                    current = float(attrs.get(attr_key) or 0.0)
                    if current <= 0:
                        continue
                    diminishing = max(0.05, 1.0 - (current / 1000.0))
                    gain = base_gain * diminishing * rng.uniform(0.7, 1.25)
                    attrs[attr_key] = round(min(1000.0, current + gain), 2)
                data["attributes"] = attrs

        data["health"] = health
        _update_player(conn, player_id, data)
        updated += 1

    if updated:
        conn.commit()
    if injuries:
        gm_service.record_injury_events(conn, int(team_id), injuries, current_date.isoformat(), "training")
    return {"ok": True, "updated": updated, "injuries": injuries}


def apply_match_effects(
    conn: sqlite3.Connection,
    team_id: int,
    player_stats: List[Dict[str, Any]],
    won: bool,
    current_date: date,
) -> Dict[str, Any]:
    injuries: List[Dict[str, Any]] = []
    updated = 0
    if not player_stats:
        return {"ok": True, "updated": 0, "injuries": []}

    team_row = conn.execute("SELECT data_json FROM team WHERE id = ?", (int(team_id),)).fetchone()
    team_data = json.loads(team_row["data_json"]) if team_row and team_row["data_json"] else {}
    facilities = team_data.get("facilities") or {}
    facility_bonuses = club_service.calculate_facility_bonuses(facilities) if facilities else {}
    injury_prevention = float(facility_bonuses.get("injury_prevention") or 0.0)
    injury_recovery = float(facility_bonuses.get("injury_recovery") or 0.0)
    medical_prev, medical_rec = _medical_modifiers(team_data)
    injury_prevention = _clamp(injury_prevention + medical_prev, -0.15, 0.3)

    ids = [int(p.get("player_id")) for p in player_stats if p.get("player_id") is not None]
    if not ids:
        return {"ok": True, "updated": 0, "injuries": []}
    placeholders = ",".join("?" for _ in ids)
    rows = conn.execute(
        f"SELECT id, name, data_json FROM player WHERE id IN ({placeholders})",
        ids,
    ).fetchall()
    row_map = {int(row["id"]): row for row in rows}

    for stat in player_stats:
        player_id = int(stat.get("player_id"))
        row = row_map.get(player_id)
        if not row:
            continue
        data = json.loads(row["data_json"]) if row["data_json"] else {}
        _ensure_health(data)
        health = data.get("health") or {}
        if health.get("last_match_date") == _iso(current_date):
            continue

        fatigue = float(health.get("fatigue") or 0)
        minutes = float(stat.get("min") or 0)
        recov = _attr(data, "fatigue_recov", 500) / 1000.0
        durability = _attr(data, "durability", 500) / 1000.0

        fatigue_add = 6.0 + max(0.0, minutes - 10.0) * 0.9
        recovery_bonus = recov * 8.0
        fatigue = _clamp(fatigue + fatigue_add - recovery_bonus, 0.0, 100.0)
        health["fatigue"] = round(fatigue, 2)
        health["last_match_date"] = _iso(current_date)

        morale = int(data.get("morale") or 50)
        morale_delta = 2 if won else -2
        if minutes >= 25:
            morale_delta += 1 if won else -1
        data["morale"] = int(_clamp(morale + morale_delta, 0, 100))

        injury_status = str(health.get("injury_status") or "healthy").lower()
        if injury_status == "healthy":
            base = 0.004 + (minutes * 0.0007) + (fatigue * 0.0006)
            durability_penalty = (1.0 - durability) * 0.008
            chance = _clamp(base + durability_penalty, 0.002, 0.12)
            if injury_prevention != 0:
                chance = _clamp(chance * (1.0 - injury_prevention), 0.002, 0.12)
            rng = random.Random(f"{team_id}:{player_id}:{_iso(current_date)}:match")
            if rng.random() < chance:
                severity = _severity_from_rng(rng, chance)
                days_out = _days_for_severity(rng, severity)
                days_out = _apply_recovery_days(days_out, injury_recovery, medical_rec)
                label = _pick_injury_label("match", severity)
                injury = _create_injury(
                    conn,
                    player_id=player_id,
                    team_id=int(team_id),
                    start=current_date,
                    severity=severity,
                    label=label,
                    source="match",
                    days_out=days_out,
                )
                health["injury_status"] = _injury_status_for_severity(severity)
                health["injury_start"] = _iso(current_date)
                health["injury_end"] = injury["end_date"]
                health["injury_days"] = days_out
                health["injury"] = injury
                _append_injury_history(health, injury)
                injuries.append(injury)

        data["health"] = health
        _update_player(conn, player_id, data)
        updated += 1

    if updated:
        conn.commit()
    if injuries:
        gm_service.record_injury_events(conn, int(team_id), injuries, _iso(current_date), "match")
    return {"ok": True, "updated": updated, "injuries": injuries}
