from __future__ import annotations

import json
import random
import sqlite3
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from ..repo import gm_repo, smartphone_content_repo
from . import club_service, youth_service, competition_service, rules_service, smartphone_service, analytics_service


def _ensure_tables(conn: sqlite3.Connection) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS gm_event ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "team_id INTEGER, "
        "event_type TEXT NOT NULL, "
        "severity TEXT, "
        "state TEXT, "
        "title TEXT, "
        "body TEXT, "
        "event_date TEXT, "
        "data_json TEXT NOT NULL, "
        "created_at INTEGER NOT NULL, "
        "updated_at INTEGER NOT NULL"
        ")"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_gm_event_team ON gm_event (team_id, created_at)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_gm_event_date ON gm_event (team_id, event_date)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS gm_decision ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "event_id INTEGER, "
        "team_id INTEGER, "
        "state TEXT NOT NULL, "
        "choice_key TEXT, "
        "options_json TEXT NOT NULL, "
        "created_at INTEGER NOT NULL, "
        "resolved_at INTEGER"
        ")"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_gm_decision_team ON gm_decision (team_id, state)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS gm_agenda ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "team_id INTEGER, "
        "event_id INTEGER, "
        "date TEXT, "
        "time TEXT, "
        "title TEXT, "
        "description TEXT, "
        "kind TEXT, "
        "data_json TEXT NOT NULL, "
        "created_at INTEGER NOT NULL, "
        "updated_at INTEGER NOT NULL"
        ")"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_gm_agenda_team_date ON gm_agenda (team_id, date)"
    )
    conn.commit()


def _ensure_smartphone_content(conn: sqlite3.Connection) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS smartphone_content ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "team_id INTEGER, "
        "content_type TEXT NOT NULL, "
        "data_json TEXT NOT NULL, "
        "created_at INTEGER NOT NULL"
        ")"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_smartphone_content_team ON smartphone_content (team_id, created_at)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_smartphone_content_type ON smartphone_content (content_type, created_at)"
    )
    conn.commit()


def _fetch_team(conn: sqlite3.Connection, team_id: Optional[int]) -> Optional[Dict[str, Any]]:
    if not team_id:
        row = conn.execute("SELECT id, name, data_json FROM team ORDER BY id LIMIT 1").fetchone()
    else:
        row = conn.execute("SELECT id, name, data_json FROM team WHERE id = ?", (int(team_id),)).fetchone()
    if not row:
        return None
    return {
        "id": int(row["id"]),
        "name": row["name"],
        "data": json.loads(row["data_json"]) if row["data_json"] else {},
    }


def _ensure_team_state(
    conn: sqlite3.Connection,
    team_id: int,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    changed = False
    if "reputation" not in data:
        data["reputation"] = 0
        changed = True
    if "board_confidence" not in data:
        data["board_confidence"] = 70
        changed = True
    if "job_security" not in data:
        data["job_security"] = int(data.get("board_confidence") or 70)
        changed = True
    if "gm_status" not in data:
        data["gm_status"] = "active"
        changed = True
    if "objectives" not in data:
        data["objectives"] = {}
        changed = True
    if "current_date" not in data:
        data["current_date"] = ""
        changed = True

    data["reputation"] = max(0, min(1000, int(data.get("reputation") or 0)))
    data["board_confidence"] = max(0, min(100, int(data.get("board_confidence") or 0)))
    data["job_security"] = max(0, min(100, int(data.get("job_security") or 0)))

    if changed:
        conn.execute(
            "UPDATE team SET data_json = ?, updated_at = ? WHERE id = ?",
            (json.dumps(data, ensure_ascii=True), int(time.time()), int(team_id)),
        )
        conn.commit()
    return data


GM_ORIGINS = {
    "ex_player": {
        "label": "Ex-Jugador",
        "skills": {"tactics": 78, "scouting": 55, "negotiation": 45, "politics": 35, "media": 50, "finance": 40},
        "salary": 260_000,
        "funds": 55_000,
    },
    "analyst": {
        "label": "Analista",
        "skills": {"tactics": 58, "scouting": 82, "negotiation": 40, "politics": 35, "media": 32, "finance": 48},
        "salary": 190_000,
        "funds": 40_000,
    },
    "ex_agent": {
        "label": "Ex-Agente",
        "skills": {"tactics": 42, "scouting": 48, "negotiation": 82, "politics": 65, "media": 58, "finance": 62},
        "salary": 230_000,
        "funds": 75_000,
    },
    "executive": {
        "label": "Directivo",
        "skills": {"tactics": 38, "scouting": 35, "negotiation": 58, "politics": 82, "media": 48, "finance": 78},
        "salary": 280_000,
        "funds": 90_000,
    },
}


def _ensure_gm_profile(team_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    profile = data.get("gm_profile") if isinstance(data.get("gm_profile"), dict) else None
    if not profile or not profile.get("origin"):
        rng = random.Random(f"{team_id}:gm_origin")
        origin_key = rng.choice(list(GM_ORIGINS.keys()))
        origin = GM_ORIGINS.get(origin_key) or GM_ORIGINS["ex_player"]
        skills = {}
        for key, base in (origin.get("skills") or {}).items():
            skills[key] = max(25, min(95, int(base + rng.randint(-6, 6))))
        profile = {
            "origin": origin_key,
            "origin_label": origin.get("label") or origin_key,
            "skills": skills,
            "perks": [],
            "level": 1,
            "xp": 0,
            "created_at": int(time.time()),
        }
        data["gm_profile"] = profile

    gm_state = data.get("gm_state") if isinstance(data.get("gm_state"), dict) else {}
    if "stress" not in gm_state:
        rng = random.Random(f"{team_id}:gm_state")
        gm_state["stress"] = rng.randint(25, 45)
    if "energy" not in gm_state:
        gm_state["energy"] = 70
    if "focus" not in gm_state:
        gm_state["focus"] = 60
    data["gm_state"] = gm_state

    finances = data.get("gm_finances") if isinstance(data.get("gm_finances"), dict) else {}
    if "salary" not in finances:
        origin = GM_ORIGINS.get(profile.get("origin") or "", GM_ORIGINS["ex_player"])
        finances["salary"] = int(origin.get("salary") or 200_000)
    if "funds" not in finances:
        origin = GM_ORIGINS.get(profile.get("origin") or "", GM_ORIGINS["ex_player"])
        finances["funds"] = int(origin.get("funds") or 40_000)
    finances.setdefault("last_pay_date", "")
    data["gm_finances"] = finances
    return data


def _objective_catalog() -> List[Dict[str, Any]]:
    catalog = rules_service.board_objectives_catalog() or {}
    return list(catalog.get("objectives") or [])


def _ensure_objectives(team_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    objectives = data.get("objectives") if isinstance(data.get("objectives"), dict) else {}
    if objectives:
        return data
    catalog = _objective_catalog()
    if not catalog:
        data["objectives"] = {}
        return data
    tier = int(data.get("tier") or 3)
    primary_pool = [o for o in catalog if str(o.get("type")) == "primary"]
    secondary_pool = [o for o in catalog if str(o.get("type")) == "secondary"]
    financial_pool = [o for o in catalog if str(o.get("type")) == "financial"]

    if tier <= 1:
        primary_id = "league_champion"
    elif tier == 2:
        primary_id = "league_top3"
    else:
        primary_id = "league_playoffs"

    def _pick(pool: List[Dict[str, Any]], fallback_id: str | None = None) -> Optional[Dict[str, Any]]:
        if not pool:
            return None
        if fallback_id:
            for item in pool:
                if item.get("id") == fallback_id:
                    return item
        rng = random.Random(f"{team_id}:objective:{fallback_id or 'any'}")
        return rng.choice(pool)

    primary = _pick(primary_pool, primary_id) or (primary_pool[0] if primary_pool else None)
    secondary = _pick(secondary_pool, "youth_development") or (secondary_pool[0] if secondary_pool else None)
    financial = _pick(financial_pool, "financial_balance") or (financial_pool[0] if financial_pool else None)

    def _pack(obj: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not obj:
            return None
        return {
            "id": obj.get("id"),
            "name": obj.get("name"),
            "threshold": obj.get("threshold"),
            "type": obj.get("type"),
        }

    next_objectives = {}
    primary_item = _pack(primary)
    secondary_item = _pack(secondary)
    financial_item = _pack(financial)
    if primary_item:
        next_objectives["primary"] = primary_item
    if secondary_item:
        next_objectives["secondary"] = secondary_item
    if financial_item:
        next_objectives["financial"] = financial_item
    data["objectives"] = next_objectives
    data["objectives_created"] = data.get("current_date") or ""
    return data


def _team_payroll(conn: sqlite3.Connection, team_id: int) -> int:
    rows = conn.execute(
        "SELECT data_json FROM contract WHERE team_id = ?",
        (int(team_id),),
    ).fetchall()
    payroll = 0
    for row in rows:
        try:
            data = json.loads(row["data_json"]) if row["data_json"] else {}
        except Exception:
            data = {}
        if str(data.get("status") or "active") != "active":
            continue
        if str(data.get("type") or "").lower() == "scholarship":
            continue
        try:
            payroll += int(data.get("salary") or 0)
        except (TypeError, ValueError):
            continue
    return int(payroll)


def _refresh_team_metrics(conn: sqlite3.Connection, team_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    league_id = data.get("league_id") or data.get("league") or data.get("leagueId")
    standings = []
    if league_id:
        try:
            snap = competition_service.snapshot(conn, {"league_id": str(league_id).upper()})
            standings = (snap.get("snapshot") or {}).get("standings") or []
        except Exception:
            standings = []
    for idx, row in enumerate(standings):
        if int(row.get("id") or 0) == int(team_id):
            data["league_position"] = idx + 1
            data["record_w"] = int(row.get("w") or 0)
            data["record_l"] = int(row.get("l") or 0)
            data["points_for"] = int(row.get("pf") or 0)
            data["points_against"] = int(row.get("pa") or 0)
            break

    payroll = _team_payroll(conn, int(team_id))
    data["payroll"] = payroll
    income = 0
    for key in ("ticket_income", "sponsors_income", "media_income"):
        try:
            income += int(data.get(key) or 0)
        except (TypeError, ValueError):
            continue
    if income > 0:
        data["payroll_percentage"] = int((payroll / income) * 100)
    else:
        data["payroll_percentage"] = int(data.get("payroll_percentage") or 0)

    season_budget_start = data.get("season_budget_start")
    if season_budget_start is None:
        data["season_budget_start"] = int(data.get("budget") or 0)
    data["year_balance"] = int(data.get("budget") or 0) - int(data.get("season_budget_start") or 0)
    data["attendance_percentage"] = int(data.get("attendance_percentage") or 0)
    return data


def _objective_completed(defn: Dict[str, Any], metrics: Dict[str, Any]) -> bool:
    if not defn:
        return False
    metric = defn.get("metric")
    threshold = defn.get("threshold")
    if metric is None or threshold is None:
        return False
    try:
        current = float(metrics.get(metric) or 0)
        threshold_val = float(threshold)
    except (TypeError, ValueError):
        return False
    comparison = defn.get("comparison") or ">="
    if comparison == "<=":
        return current <= threshold_val
    if comparison == "<":
        return current < threshold_val
    if comparison == ">":
        return current > threshold_val
    return current >= threshold_val


def _objective_progress(defn: Dict[str, Any], metrics: Dict[str, Any]) -> Dict[str, Any]:
    metric = defn.get("metric")
    threshold = defn.get("threshold")
    if metric is None or threshold is None:
        return {"progress": 0, "current": 0, "target": threshold}
    try:
        current = float(metrics.get(metric) or 0)
        threshold_val = float(threshold)
    except (TypeError, ValueError):
        return {"progress": 0, "current": 0, "target": threshold}
    comparison = defn.get("comparison") or ">="
    if comparison in {"<=", "<"}:
        if threshold_val <= 0:
            progress = 0
        else:
            progress = (threshold_val / max(1.0, current)) * 100 if current > 0 else 100
    else:
        progress = (current / max(1.0, threshold_val)) * 100 if threshold_val else 0
    return {
        "progress": max(0, min(100, int(progress))),
        "current": current,
        "target": threshold_val,
    }


def _update_objectives_progress(data: Dict[str, Any], metrics: Dict[str, Any]) -> None:
    objectives = data.get("objectives")
    if not isinstance(objectives, dict) or not objectives:
        return
    catalog = _objective_catalog()
    catalog_by_id = {obj.get("id"): obj for obj in catalog}
    for key, obj in objectives.items():
        defn = catalog_by_id.get(obj.get("id")) or {}
        progress = _objective_progress(defn, metrics)
        obj["progress"] = progress["progress"]
        obj["current"] = progress["current"]
        obj["target"] = progress["target"]
        obj["name"] = defn.get("name") or obj.get("name") or obj.get("id")
        objectives[key] = obj
    data["objectives"] = objectives

def _evaluate_objectives_if_due(
    conn: sqlite3.Connection,
    team_id: int,
    data: Dict[str, Any],
    day: str,
    metrics: Dict[str, Any],
) -> None:
    if not day:
        return
    league_id = str(data.get("league_id") or data.get("league") or "").upper()
    rules_snapshot = rules_service.snapshot()
    season_end = None
    for league in rules_snapshot.get("leagues") or []:
        if str(league.get("id") or "").upper() == league_id:
            rules = league.get("rules") or {}
            season_dates = (
                rules.get("season_dates_2025_26")
                or rules.get("season_dates_2025")
                or rules.get("season_dates")
                or {}
            )
            season_end = (
                season_dates.get("regular_season_end")
                or season_dates.get("playoff_end")
                or season_dates.get("liga_regular_end")
            )
            break
    if not season_end or str(season_end) != str(day):
        return
    if data.get("objectives_evaluated") == day:
        return

    catalog = _objective_catalog()
    catalog_by_id = {obj.get("id"): obj for obj in catalog}
    objectives = data.get("objectives") if isinstance(data.get("objectives"), dict) else {}
    summary_lines = []
    total_budget = 0
    total_confidence = 0
    for obj in objectives.values():
        defn = catalog_by_id.get(obj.get("id")) or {}
        completed = _objective_completed(defn, metrics)
        if completed:
            total_budget += int(defn.get("reward_budget") or 0)
            total_confidence += int(defn.get("reward_confidence") or 0)
            summary_lines.append(f"{defn.get('name') or obj.get('id')}: completado")
        else:
            total_budget += int(defn.get("penalty_budget") or 0)
            total_confidence += int(defn.get("penalty_confidence") or 0)
            summary_lines.append(f"{defn.get('name') or obj.get('id')}: fallado")

    data["budget"] = int(data.get("budget") or 0) + total_budget
    data["board_confidence"] = max(0, min(100, int(data.get("board_confidence") or 70) + total_confidence))
    data["job_security"] = max(0, min(100, int(data.get("job_security") or 70) + int(total_confidence / 2)))
    data["objectives_evaluated"] = day
    data["season"] = int(data.get("season") or 1) + 1
    data["objectives"] = {}
    data["season_budget_start"] = int(data.get("budget") or 0)

    summary = " | ".join(summary_lines) if summary_lines else "Sin objetivos evaluados."
    event = gm_repo.create_event(
        conn,
        team_id=int(team_id),
        event_type="objectives_review",
        severity="info",
        state="open",
        title="Revision de objetivos",
        body=summary,
        event_date=day,
        data={"origin": "board", "budget_delta": total_budget, "confidence_delta": total_confidence},
    )
    try:
        smartphone_service.create_content(
            conn,
            {
                "team_id": int(team_id),
                "content_type": "news",
                "data": {
                    "title": "Revision de objetivos",
                    "content": summary,
                    "timestamp": day,
                    "type": "board",
                    "event_id": event.get("id"),
                },
            },
        )
    except Exception:
        pass

    try:
        analytics_service.finalize_league_season(conn, league_id, season_end)
    except Exception:
        pass


def _shift_date(value: str, delta_days: int) -> str:
    if not value:
        return ""
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d").date()
    except Exception:
        return value
    return (parsed + timedelta(days=int(delta_days))).isoformat()


def _meeting_effects(meeting_type: str) -> Dict[str, Dict[str, int]]:
    kind = str(meeting_type or "").lower()
    if kind == "board":
        return {
            "schedule": {"board_confidence": 3, "job_security": 2},
            "postpone": {"board_confidence": -1},
            "reject": {"board_confidence": -6, "job_security": -4},
        }
    if kind == "player":
        return {
            "schedule": {"morale": 3, "cohesion": 2},
            "postpone": {"morale": -1},
            "reject": {"morale": -4, "cohesion": -2},
        }
    if kind == "agent":
        return {
            "schedule": {"reputation": 2},
            "postpone": {"reputation": -1},
            "reject": {"reputation": -3},
        }
    return {
        "schedule": {"reputation": 1},
        "postpone": {},
        "reject": {"reputation": -2},
    }


def _build_meeting_options(request: Dict[str, Any], day: str) -> List[Dict[str, Any]]:
    meeting_type = request.get("type") or request.get("category") or "general"
    effects = _meeting_effects(str(meeting_type))
    base_date = day or request.get("date") or ""
    schedule_date = base_date
    postpone_date = _shift_date(base_date, 2) if base_date else ""
    schedule_time = "10:00"
    postpone_time = "11:00"
    topic = request.get("topic") or "Reunion"
    requester = request.get("requester") or "Contacto"
    agenda_title = f"Reunion: {requester}"
    agenda_desc = topic
    return [
        {
            "key": "schedule",
            "label": "Agendar reunion",
            "effects": effects.get("schedule") or {},
            "agenda": {
                "title": agenda_title,
                "description": agenda_desc,
                "date": schedule_date,
                "time": schedule_time,
                "kind": "meeting",
            },
        },
        {
            "key": "postpone",
            "label": "Aplazar",
            "effects": effects.get("postpone") or {},
            "agenda": {
                "title": f"Revisar solicitud: {requester}",
                "description": agenda_desc,
                "date": postpone_date,
                "time": postpone_time,
                "kind": "meeting_followup",
            },
        },
        {
            "key": "reject",
            "label": "Rechazar",
            "effects": effects.get("reject") or {},
        },
    ]


def _create_meeting_request(
    conn: sqlite3.Connection,
    team_id: int,
    day: str,
    request: Dict[str, Any],
    event_type: str = "meeting_request",
    options: Optional[List[Dict[str, Any]]] = None,
) -> Optional[Dict[str, Any]]:
    meeting_id = None
    payload = {**request, "date": day, "state": "open"}
    try:
        content = smartphone_service.create_content(
            conn,
            {
                "team_id": int(team_id),
                "content_type": "meeting_request",
                "data": payload,
            },
        )
        meeting_id = content.get("id") if isinstance(content, dict) else None
    except Exception:
        meeting_id = None
    event = None
    try:
        event = gm_repo.create_event(
            conn,
            team_id=int(team_id),
            event_type=event_type,
            severity=request.get("urgency") or "info",
            state="open",
            title=request.get("topic") or "Reunion",
            body=request.get("message") or "",
            event_date=day,
            data={"origin": "meeting", "request": payload, "meeting_request_id": meeting_id},
        )
    except Exception:
        event = None

    if options is None:
        options = _build_meeting_options(payload, day)
    if options and event:
        try:
            gm_repo.create_decision(conn, event_id=event["id"], team_id=team_id, options=options)
        except Exception:
            pass
    return event


def _resolve_meeting_request(
    conn: sqlite3.Connection,
    team_id: int,
    meeting_request_id: int,
    option_key: str,
    selected_option: Optional[Dict[str, Any]],
    event: Optional[Dict[str, Any]],
) -> None:
    content = smartphone_content_repo.get_content(conn, int(meeting_request_id))
    if not content or content.get("content_type") != "meeting_request":
        return
    data = content.get("data") if isinstance(content, dict) else {}
    if not isinstance(data, dict):
        data = {}

    state = str(data.get("state") or "open").lower()
    if state in {"resolved", "rejected", "scheduled", "postponed"}:
        return

    action = str(
        (selected_option or {}).get("meeting_action")
        or (selected_option or {}).get("action")
        or option_key
        or ""
    ).lower()
    if action in {"schedule", "accept"}:
        new_state = "scheduled"
    elif action in {"postpone", "reschedule"}:
        new_state = "postponed"
    elif action in {"reject", "decline"}:
        new_state = "rejected"
    else:
        new_state = "resolved"

    data["state"] = new_state
    data["resolved_at"] = int(time.time())
    data["decision"] = action or option_key
    smartphone_content_repo.update_content(conn, int(meeting_request_id), data)

    event_id = event.get("id") if isinstance(event, dict) else None
    event_date = event.get("event_date") if isinstance(event, dict) else ""
    agenda = (selected_option or {}).get("agenda") if isinstance(selected_option, dict) else {}
    if not isinstance(agenda, dict):
        agenda = {}
    has_agenda = bool(agenda.get("date") or agenda.get("time") or agenda.get("title"))

    if new_state == "scheduled":
        schedule_date = agenda.get("date") or data.get("date") or event_date or ""
        schedule_time = agenda.get("time") or "10:00"
        participant = data.get("requester") or "Contacto"
        topic = data.get("topic") or "Reunion"
        meeting_payload = {
            "participant": participant,
            "topic": topic,
            "scheduledDate": schedule_date,
            "scheduledTime": schedule_time,
            "duration": "45 min",
            "type": data.get("type") or "general",
            "request_id": int(meeting_request_id),
        }
        try:
            _ensure_smartphone_content(conn)
            smartphone_content_repo.create_content(
                conn,
                content_type="meeting_scheduled",
                data=meeting_payload,
                team_id=int(team_id),
                created_at=int(time.time()),
            )
        except Exception:
            pass
        if schedule_date and not has_agenda:
            try:
                gm_repo.create_agenda_item(
                    conn,
                    team_id=int(team_id),
                    event_id=event_id,
                    title=f"Reunion: {participant}",
                    description=topic,
                    date=schedule_date,
                    time_value=schedule_time,
                    kind="meeting",
                    data={"request_id": int(meeting_request_id)},
                )
            except Exception:
                pass
        try:
            gm_repo.create_event(
                conn,
                team_id=int(team_id),
                event_type="meeting_scheduled",
                severity="info",
                state="open",
                title="Reunion agendada",
                body=f"{participant} - {topic}",
                event_date=schedule_date or event_date,
                data={"origin": "meeting", "request_id": int(meeting_request_id)},
            )
        except Exception:
            pass
    elif new_state == "rejected":
        try:
            gm_repo.create_event(
                conn,
                team_id=int(team_id),
                event_type="meeting_rejected",
                severity="low",
                state="open",
                title="Reunion rechazada",
                body=data.get("topic") or "Solicitud rechazada",
                event_date=event_date or data.get("date") or "",
                data={"origin": "meeting", "request_id": int(meeting_request_id)},
            )
        except Exception:
            pass


def _pick_board_contact(team_data: Dict[str, Any]) -> Tuple[str, str]:
    board = team_data.get("board") if isinstance(team_data.get("board"), list) else []
    if board:
        member = board[0]
        return member.get("name") or "Directiva", member.get("role") or "Directiva"
    return "Directiva", "Consejo"


def _pick_team_player(conn: sqlite3.Connection, team_id: int) -> Tuple[str, str]:
    row = conn.execute(
        "SELECT name, data_json FROM player WHERE json_extract(data_json, '$.team_id') = ? ORDER BY id LIMIT 1",
        (int(team_id),),
    ).fetchone()
    if not row:
        return "Capitan", "Jugador"
    data = json.loads(row["data_json"]) if row["data_json"] else {}
    role = (data.get("bio") or {}).get("pos") or "Jugador"
    return row["name"], role


def _create_scandal(
    conn: sqlite3.Connection,
    team_id: int,
    day: str,
    title: str,
    body: str,
) -> None:
    try:
        smartphone_service.create_content(
            conn,
            {
                "team_id": int(team_id),
                "content_type": "scandal",
                "data": {
                    "title": title,
                    "content": body,
                    "timestamp": day,
                    "type": "scandal",
                },
            },
        )
    except Exception:
        pass

def _update_fan_pulse(
    conn: sqlite3.Connection,
    team_id: int,
    data: Dict[str, Any],
    day: str,
    summary: Dict[str, Any],
) -> Dict[str, Any]:
    prev = data.get("fan_pulse") if isinstance(data.get("fan_pulse"), dict) else {}
    prev_sentiment = int((prev.get("sentiment") or {}).get("value") or 50)
    board = int(data.get("board_confidence") or 70)
    rep = int(data.get("reputation") or 0)
    wins = int(data.get("record_w") or 0)
    losses = int(data.get("record_l") or 0)
    delta_wl = wins - losses
    base = 50 + (board - 70) * 0.5 + (rep - 500) / 25 + delta_wl * 2
    sentiment = max(0, min(100, int(base)))
    sentiment_change = sentiment - prev_sentiment

    team_row = conn.execute("SELECT name, data_json FROM team WHERE id = ?", (int(team_id),)).fetchone()
    team_name = team_row["name"] if team_row else "Equipo"

    feed: List[Dict[str, Any]] = []
    match_summary = summary.get("match") or {}
    if match_summary.get("homeScore") is not None and match_summary.get("awayScore") is not None:
        home_score = int(match_summary.get("homeScore") or 0)
        away_score = int(match_summary.get("awayScore") or 0)
        is_home = str(match_summary.get("homeId")) == str(team_id)
        won = home_score > away_score if is_home else away_score > home_score
        result = "victoria" if won else "derrota"
        opponent_id = match_summary.get("awayId") if is_home else match_summary.get("homeId")
        opponent = conn.execute("SELECT name FROM team WHERE id = ?", (int(opponent_id),)).fetchone() if opponent_id else None
        opponent_name = opponent["name"] if opponent else "rival"
        feed.append(
            {
                "id": f"match-{day}",
                "timestamp": day,
                "text": f"{team_name} logra una {result} ante {opponent_name} ({home_score}-{away_score}).",
                "sentiment": "positive" if won else "negative",
            }
        )

    if sentiment_change >= 8:
        feed.append(
            {
                "id": f"pulse-up-{day}",
                "timestamp": day,
                "text": f"La aficion de {team_name} sube el volumen: confianza en aumento.",
                "sentiment": "positive",
            }
        )
    elif sentiment_change <= -8:
        feed.append(
            {
                "id": f"pulse-down-{day}",
                "timestamp": day,
                "text": f"La grada empieza a dudar del proyecto de {team_name}.",
                "sentiment": "negative",
            }
        )

    standings = []
    league_id = data.get("league_id") or data.get("league") or data.get("leagueId")
    if league_id:
        try:
            snap = competition_service.snapshot(conn, {"league_id": str(league_id).upper()})
            standings = (snap.get("snapshot") or {}).get("standings") or []
        except Exception:
            standings = []
    rankings = []
    for idx, row in enumerate(standings[:5]):
        rankings.append(
            {
                "rank": idx + 1,
                "team": row.get("name") or "",
                "record": f"{row.get('w', 0)}-{row.get('l', 0)}",
                "comment": "En forma" if idx == 0 else "En pelea",
                "change": 0,
            }
        )

    teams_rows = []
    if league_id:
        teams_rows = conn.execute(
            "SELECT id, name, data_json FROM team WHERE UPPER(COALESCE(json_extract(data_json, '$.league_id'), json_extract(data_json, '$.league'))) = ?",
            (str(league_id).upper(),),
        ).fetchall()
    hot_seat = []
    if teams_rows:
        scored = []
        for row in teams_rows:
            tdata = json.loads(row["data_json"]) if row["data_json"] else {}
            score = int(tdata.get("job_security") or tdata.get("board_confidence") or 70)
            scored.append((score, row["name"]))
        scored.sort(key=lambda s: s[0])
        for idx, (score, name) in enumerate(scored[:5]):
            if score <= 35:
                temp = "scorching"
            elif score <= 50:
                temp = "hot"
            elif score <= 65:
                temp = "warm"
            else:
                temp = "cool"
            hot_seat.append(
                {
                    "rank": idx + 1,
                    "gm": name,
                    "team": name,
                    "temperature": temp,
                    "reason": "Presion alta" if score <= 50 else "En vigilancia",
                }
            )

    narratives = []
    league_pos = int(data.get("league_position") or 0)
    if league_pos and league_pos <= 3:
        narratives.append({"id": "title_push", "narrative": "Candidato al titulo", "strength": min(95, 60 + (4 - league_pos) * 10)})
    if league_pos and league_pos >= 12:
        narratives.append({"id": "relegation_fight", "narrative": "Lucha por evitar descenso", "strength": min(90, 40 + (league_pos - 11) * 5)})
    if int(data.get("youth_promoted") or 0) >= 2:
        narratives.append({"id": "youth_project", "narrative": "Proyecto de cantera", "strength": 65})
    if board <= 45:
        narratives.append({"id": "hot_seat", "narrative": "GM bajo presion", "strength": min(95, 50 + (50 - board))})

    expectations = []
    objectives = data.get("objectives") if isinstance(data.get("objectives"), dict) else {}
    catalog = _objective_catalog()
    catalog_by_id = {obj.get("id"): obj for obj in catalog}
    for obj in objectives.values():
        defn = catalog_by_id.get(obj.get("id")) or {}
        metric = defn.get("metric")
        if not metric:
            continue
        current_val = data.get(metric)
        if current_val is None:
            current_val = 0
        expectations.append(
            {
                "category": defn.get("name") or obj.get("id"),
                "current": f"{current_val} / {defn.get('threshold')}",
            }
        )

    fan_pulse = {
        "sentiment": {"value": sentiment, "change": sentiment_change},
        "feed": feed,
        "trending": ["#Mercado", "#Playoffs"] if sentiment >= 55 else ["#Crisis", "#Directiva"],
        "predictions": [
            {
                "id": f"pred-{day}",
                "timestamp": day,
                "category": "Liga",
                "prediction": "Mantenerse en playoffs" if league_pos and league_pos <= 8 else "Necesita reaccion",
                "source": "Analistas",
                "confidence": 65 if league_pos and league_pos <= 8 else 40,
            }
        ],
        "rankings": rankings,
        "hotSeat": hot_seat,
        "expectations": expectations,
        "narratives": narratives,
        "updated": day,
    }
    data["fan_pulse"] = fan_pulse
    return fan_pulse


def _apply_effects(conn: sqlite3.Connection, team_id: int, effects: Dict[str, Any]) -> Dict[str, Any]:
    row = conn.execute("SELECT data_json FROM team WHERE id = ?", (int(team_id),)).fetchone()
    if not row:
        return {}
    data = json.loads(row["data_json"]) if row["data_json"] else {}
    data = _ensure_team_state(conn, team_id, data)

    reputation_delta = int(effects.get("reputation", effects.get("reputation_delta", 0)) or 0)
    board_delta = int(effects.get("board_confidence", effects.get("board_confidence_delta", 0)) or 0)
    security_delta = int(effects.get("job_security", effects.get("job_security_delta", 0)) or 0)
    morale_delta = int(effects.get("morale", effects.get("morale_delta", 0)) or 0)
    budget_delta = int(effects.get("budget", effects.get("budget_delta", 0)) or 0)

    data["reputation"] = max(0, min(1000, int(data.get("reputation") or 0) + reputation_delta))
    data["board_confidence"] = max(0, min(100, int(data.get("board_confidence") or 0) + board_delta))
    data["job_security"] = max(0, min(100, int(data.get("job_security") or 0) + security_delta))
    data["morale"] = max(0, min(100, int(data.get("morale") or 50) + morale_delta))
    data["budget"] = int(data.get("budget") or 0) + budget_delta

    for key in ("fatigue", "cohesion", "tactical", "fitness", "recovery", "prep"):
        delta = effects.get(key, effects.get(f"{key}_delta", 0))
        try:
            delta = int(delta or 0)
        except (TypeError, ValueError):
            delta = 0
        if not delta:
            continue
        base = int(data.get(key) or 50)
        data[key] = max(0, min(100, base + delta))

    flags = data.get("gm_flags")
    if not isinstance(flags, list):
        flags = []
    add_flags = effects.get("flags_add") or effects.get("add_flags") or []
    remove_flags = effects.get("flags_remove") or effects.get("remove_flags") or []
    for flag in add_flags:
        if flag and flag not in flags:
            flags.append(flag)
    if remove_flags:
        flags = [flag for flag in flags if flag not in set(remove_flags)]
    data["gm_flags"] = flags

    status = effects.get("gm_status") or effects.get("status")
    if status:
        data["gm_status"] = str(status)

    conn.execute(
        "UPDATE team SET data_json = ?, updated_at = ? WHERE id = ?",
        (json.dumps(data, ensure_ascii=True), int(time.time()), int(team_id)),
    )
    conn.commit()
    return {
        "reputation": data.get("reputation"),
        "board_confidence": data.get("board_confidence"),
        "job_security": data.get("job_security"),
        "morale": data.get("morale"),
        "budget": data.get("budget"),
        "gm_status": data.get("gm_status"),
        "fatigue": data.get("fatigue"),
        "cohesion": data.get("cohesion"),
        "tactical": data.get("tactical"),
        "fitness": data.get("fitness"),
        "recovery": data.get("recovery"),
        "prep": data.get("prep"),
    }


def _event_exists(conn: sqlite3.Connection, team_id: int, event_type: str, event_date: str) -> bool:
    row = conn.execute(
        "SELECT id FROM gm_event WHERE team_id = ? AND event_type = ? AND event_date = ? LIMIT 1",
        (int(team_id), str(event_type), str(event_date)),
    ).fetchone()
    return row is not None


def _create_daily_event(
    conn: sqlite3.Connection,
    team_id: int,
    event_date: str,
    event_type: str,
    title: str,
    body: str,
    options: Optional[List[Dict[str, Any]]] = None,
    severity: str = "info",
    content_type: str = "news",
    content_kind: str = "daily",
) -> Optional[Dict[str, Any]]:
    event = gm_repo.create_event(
        conn,
        team_id=team_id,
        event_type=event_type,
        severity=severity,
        state="open",
        title=title,
        body=body,
        event_date=event_date,
        data={"origin": "system", "category": "daily"},
    )
    if options:
        gm_repo.create_decision(conn, event_id=event["id"], team_id=team_id, options=options)
    try:
        _ensure_smartphone_content(conn)
        smartphone_content_repo.create_content(
            conn,
            content_type=content_type,
            data={
                "title": title,
                "content": body,
                "timestamp": event_date,
                "type": content_kind,
                "event_id": event.get("id"),
            },
            team_id=int(team_id),
            created_at=int(time.time()),
        )
    except Exception:
        pass
    return event


def snapshot(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_tables(conn)
    team_id = payload.get("team_id")
    team = _fetch_team(conn, team_id)
    resolved_team_id = team.get("id") if team else None
    team_data = (team or {}).get("data") or {}
    if resolved_team_id is not None:
        team_data = _ensure_team_state(conn, int(resolved_team_id), team_data)
        needs_update = False
        if not isinstance(team_data.get("gm_profile"), dict) or not team_data["gm_profile"].get("origin"):
            team_data = _ensure_gm_profile(int(resolved_team_id), team_data)
            needs_update = True
        if not isinstance(team_data.get("objectives"), dict) or not team_data.get("objectives"):
            team_data = _ensure_objectives(int(resolved_team_id), team_data)
            needs_update = True
        if needs_update:
            conn.execute(
                "UPDATE team SET data_json = ?, updated_at = ? WHERE id = ?",
                (json.dumps(team_data, ensure_ascii=True), int(time.time()), int(resolved_team_id)),
            )
            conn.commit()

    events = gm_repo.list_events(conn, resolved_team_id, limit=int(payload.get("limit") or 80))
    decisions = gm_repo.list_decisions(conn, resolved_team_id, state="pending", limit=40)

    event_map = {int(e["id"]): e for e in events}
    decisions_out: List[Dict[str, Any]] = []
    for decision in decisions:
        event = event_map.get(int(decision["event_id"])) if decision.get("event_id") else None
        decisions_out.append(
            {
                **decision,
                "event_title": event.get("title") if event else "",
                "event_type": event.get("event_type") if event else "",
                "event_severity": event.get("severity") if event else "",
            }
        )

    agenda = gm_repo.list_agenda_items(conn, resolved_team_id, limit=200)

    snapshot_payload = {
        "team_id": resolved_team_id,
        "state": {
            "reputation": team_data.get("reputation"),
            "board_confidence": team_data.get("board_confidence"),
            "job_security": team_data.get("job_security"),
            "gm_status": team_data.get("gm_status"),
            "objectives": team_data.get("objectives") or {},
            "gm_flags": team_data.get("gm_flags") or [],
            "current_date": team_data.get("current_date") or "",
            "morale": team_data.get("morale"),
            "fatigue": team_data.get("fatigue"),
            "cohesion": team_data.get("cohesion"),
            "tactical": team_data.get("tactical"),
            "fitness": team_data.get("fitness"),
            "recovery": team_data.get("recovery"),
            "prep": team_data.get("prep"),
            "gm_profile": team_data.get("gm_profile") or {},
            "gm_state": team_data.get("gm_state") or {},
            "gm_finances": team_data.get("gm_finances") or {},
            "fan_pulse": team_data.get("fan_pulse") or {},
            "stress": (team_data.get("gm_state") or {}).get("stress"),
            "energy": (team_data.get("gm_state") or {}).get("energy"),
        },
        "events": events,
        "decisions": decisions_out,
        "agenda": agenda,
    }
    return {"snapshot": snapshot_payload}


def create_event(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_tables(conn)
    team_id = payload.get("team_id")
    event_type = payload.get("event_type") or payload.get("type") or "news"
    severity = payload.get("severity") or "info"
    title = payload.get("title") or payload.get("headline") or ""
    body = payload.get("body") or payload.get("text") or ""
    if not str(title).strip():
        return {"ok": False, "error": {"message": "title required"}}
    event_date = payload.get("date") or payload.get("event_date") or ""
    event_time = payload.get("time") or payload.get("event_time") or ""
    state = payload.get("state") or "open"
    data = payload.get("data") or {}
    origin = payload.get("origin") or payload.get("source") or "manual"
    data["origin"] = origin

    event = gm_repo.create_event(
        conn,
        team_id=team_id,
        event_type=str(event_type),
        severity=str(severity),
        state=str(state),
        title=str(title),
        body=str(body),
        event_date=str(event_date),
        data=data,
    )

    decision_payload = None
    options = payload.get("options") or payload.get("decision_options") or []
    if isinstance(options, list) and options:
        decision_payload = gm_repo.create_decision(conn, event_id=event["id"], team_id=team_id, options=options)

    add_to_agenda = bool(payload.get("add_to_agenda")) or bool(payload.get("agenda"))
    if add_to_agenda and event_date:
        agenda_data = payload.get("agenda") or {}
        gm_repo.create_agenda_item(
            conn,
            team_id=team_id,
            event_id=event["id"],
            title=agenda_data.get("title") or event.get("title") or "",
            description=agenda_data.get("description") or event.get("body") or "",
            date=agenda_data.get("date") or event_date,
            time_value=agenda_data.get("time") or event_time,
            kind=agenda_data.get("kind") or event_type,
            data=agenda_data.get("data") or {},
        )

    return {"ok": True, "event": event, "decision": decision_payload}


def apply_decision(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_tables(conn)
    decision_id = payload.get("decision_id") or payload.get("id")
    option_key = payload.get("option_key") or payload.get("choice_key")
    if not decision_id:
        return {"ok": False, "error": {"message": "decision_id required"}}
    decision = gm_repo.get_decision(conn, int(decision_id))
    if not decision:
        return {"ok": False, "error": {"message": "Decision not found"}}
    if decision.get("state") != "pending":
        return {"ok": False, "error": {"message": "Decision already resolved"}}

    options = decision.get("options") or []
    selected = None
    if option_key is None and options:
        selected = options[0]
        option_key = selected.get("key") or "option_0"
    else:
        for opt in options:
            if str(opt.get("key")) == str(option_key):
                selected = opt
                break
    if not selected:
        return {"ok": False, "error": {"message": "Option not found"}}

    event = None
    if decision.get("event_id"):
        try:
            event = gm_repo.get_event(conn, int(decision["event_id"]))
        except Exception:
            event = None

    team_id = decision.get("team_id")
    effects = selected.get("effects") or {}
    updated_state = None
    if team_id:
        updated_state = _apply_effects(conn, int(team_id), effects)

    gm_repo.resolve_decision(conn, int(decision_id), str(option_key))
    if decision.get("event_id"):
        gm_repo.update_event_state(conn, int(decision["event_id"]), "resolved")

    agenda = selected.get("agenda")
    if agenda and team_id:
        gm_repo.create_agenda_item(
            conn,
            team_id=team_id,
            event_id=decision.get("event_id"),
            title=agenda.get("title") or "Reunion",
            description=agenda.get("description") or "",
            date=agenda.get("date") or "",
            time_value=agenda.get("time") or "",
            kind=agenda.get("kind") or "meeting",
            data=agenda.get("data") or {},
        )

    followup = selected.get("create_event") or selected.get("followup_event")
    followup_event = None
    if followup and team_id and (followup.get("title") or followup.get("headline")):
        followup_event = gm_repo.create_event(
            conn,
            team_id=team_id,
            event_type=str(followup.get("event_type") or "news"),
            severity=str(followup.get("severity") or "info"),
            state=str(followup.get("state") or "open"),
            title=str(followup.get("title") or followup.get("headline") or ""),
            body=str(followup.get("body") or ""),
            event_date=str(followup.get("date") or ""),
            data=followup.get("data") or {},
        )

    meeting_request_id = None
    if event and isinstance(event.get("data"), dict):
        meeting_request_id = event["data"].get("meeting_request_id")
    if meeting_request_id and team_id:
        _resolve_meeting_request(
            conn,
            int(team_id),
            int(meeting_request_id),
            str(option_key),
            selected,
            event,
        )

    return {
        "ok": True,
        "decision_id": int(decision_id),
        "choice_key": str(option_key),
        "team_state": updated_state,
        "followup_event": followup_event,
    }


def advance_day(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_tables(conn)
    team_id = payload.get("team_id")
    if not team_id:
        return {"ok": False, "error": {"message": "team_id required"}}
    day = str(payload.get("date") or "")
    parsed_day = None
    if day:
        try:
            parsed_day = datetime.strptime(day, "%Y-%m-%d").date()
        except Exception:
            parsed_day = None

    row = conn.execute("SELECT data_json FROM team WHERE id = ?", (int(team_id),)).fetchone()
    if not row:
        return {"ok": False, "error": {"message": "Team not found"}}
    data = json.loads(row["data_json"]) if row["data_json"] else {}
    data = _ensure_team_state(conn, int(team_id), data)
    data = _ensure_gm_profile(int(team_id), data)
    data = _ensure_objectives(int(team_id), data)

    created: List[Dict[str, Any]] = []
    decision_created = False

    summary = payload.get("summary") or {}
    if not isinstance(summary, dict):
        summary = {}
    training_summary = summary.get("training") or {}
    market_summary = summary.get("market") or {}
    match_summary = summary.get("match") or {}

    if data.get("gm_status") == "fired":
        return {"ok": True, "events": created}

    if parsed_day:
        try:
            youth_summary = youth_service.advance_day(conn, int(team_id), parsed_day, emit_events=True)
        except Exception:
            youth_summary = None
        if isinstance(youth_summary, dict) and youth_summary.get("ok"):
            summary["youth"] = {
                "academy_added": youth_summary.get("academy_added", 0),
                "academy_left": youth_summary.get("academy_left", 0),
                "academy_count": youth_summary.get("academy_count", 0),
                "scout_reports": youth_summary.get("scout_reports", 0),
                "prospects_created": youth_summary.get("prospects_created", 0),
            }
            # Reload team data after youth updates to avoid overwriting cantera/scouting info.
            row = conn.execute("SELECT data_json FROM team WHERE id = ?", (int(team_id),)).fetchone()
            if row and row["data_json"]:
                data = json.loads(row["data_json"])
                data = _ensure_team_state(conn, int(team_id), data)
                data = _ensure_gm_profile(int(team_id), data)
                data = _ensure_objectives(int(team_id), data)

    data = _refresh_team_metrics(conn, int(team_id), data)

    if day:
        data["current_date"] = day
    team_state = payload.get("team_state")
    if isinstance(team_state, dict):
        for key in ("morale", "fatigue", "cohesion", "tactical", "fitness", "recovery", "prep"):
            if key not in team_state:
                continue
            try:
                value = int(team_state.get(key))
            except (TypeError, ValueError):
                continue
            data[key] = max(0, min(100, value))

    staff_summary = None
    facility_upkeep = 0
    if day:
        staff_update = club_service.refresh_staff_performance(int(team_id), data, day)
        staff_summary = staff_update.get("summary") if isinstance(staff_update, dict) else None
        facility_upkeep = club_service.apply_facility_upkeep(data, day)
        if staff_summary:
            summary["staff_performance"] = staff_summary
        if facility_upkeep:
            summary["facility_upkeep"] = int(facility_upkeep)

    def _has_open(event_type: str) -> bool:
        items = gm_repo.list_events(conn, int(team_id), limit=10, states=["open"])
        return any(str(item.get("event_type")) == str(event_type) for item in items)

    board_confidence = int(data.get("board_confidence") or 0)
    job_security = int(data.get("job_security") or 0)

    if board_confidence <= 40 and not _has_open("board_crisis"):
        options = [
            {
                "key": "meeting",
                "label": "Convocar reunion urgente",
                "effects": {"board_confidence": 6, "budget": -100000},
                "agenda": {"title": "Reunion directiva", "date": day, "time": "10:00", "kind": "meeting"},
            },
            {
                "key": "ignore",
                "label": "Seguir el plan actual",
                "effects": {"board_confidence": -6, "job_security": -5},
            },
        ]
        event = gm_repo.create_event(
            conn,
            team_id=team_id,
            event_type="board_crisis",
            severity="high",
            state="open",
            title="Crisis con la directiva",
            body="La directiva exige respuestas inmediatas sobre el rendimiento reciente.",
            event_date=day,
            data={"origin": "system", "category": "board"},
        )
        gm_repo.create_decision(conn, event_id=event["id"], team_id=team_id, options=options)
        created.append(event)
        decision_created = True

    if job_security <= 20 and not _has_open("job_warning"):
        options = [
            {
                "key": "address",
                "label": "Presentar plan de mejora",
                "effects": {"board_confidence": 4, "job_security": 6},
            },
            {
                "key": "deflect",
                "label": "Culpar a las lesiones",
                "effects": {"board_confidence": -3, "reputation": -5},
            },
        ]
        event = gm_repo.create_event(
            conn,
            team_id=team_id,
            event_type="job_warning",
            severity="high",
            state="open",
            title="Ultimatum de la directiva",
            body="Tu puesto esta en riesgo. La directiva quiere un plan concreto.",
            event_date=day,
            data={"origin": "system", "category": "board"},
        )
        gm_repo.create_decision(conn, event_id=event["id"], team_id=team_id, options=options)
        created.append(event)
        decision_created = True

    if job_security <= 0 and data.get("gm_status") != "fired":
        data["gm_status"] = "fired"
        conn.execute(
            "UPDATE team SET data_json = ?, updated_at = ? WHERE id = ?",
            (json.dumps(data, ensure_ascii=True), int(time.time()), int(team_id)),
        )
        conn.commit()
        event = gm_repo.create_event(
            conn,
            team_id=team_id,
            event_type="termination",
            severity="critical",
            state="resolved",
            title="Despido",
            body="La directiva ha decidido finalizar tu etapa en el club.",
            event_date=day,
            data={"origin": "system", "category": "board"},
        )
        created.append(event)

    if day and team_id:
        try:
            parsed_day = datetime.strptime(day, "%Y-%m-%d").date()
            weekday = parsed_day.weekday()
        except Exception:
            parsed_day = None
            weekday = None

        if facility_upkeep and weekday == 0 and not _event_exists(conn, int(team_id), "facility_upkeep", day):
            event = _create_daily_event(
                conn,
                int(team_id),
                day,
                "facility_upkeep",
                "Costes de instalaciones",
                f"Coste diario estimado por instalaciones: -{int(facility_upkeep)}.",
                content_kind="finance",
            )
            if event:
                created.append(event)

        if weekday == 0 and not _event_exists(conn, int(team_id), "staff_report", day):
            event = _create_daily_event(
                conn,
                int(team_id),
                day,
                "staff_report",
                "Informe del staff tecnico",
                "El cuerpo tecnico propone ajustar la carga de entrenamiento semanal.",
                options=[
                    {
                        "key": "subir_intensidad",
                        "label": "Subir intensidad",
                        "effects": {"fitness": 2, "fatigue": 4, "morale": -1},
                    },
                    {
                        "key": "mantener_plan",
                        "label": "Mantener plan",
                        "effects": {"fitness": 1, "cohesion": 1},
                    },
                    {
                        "key": "bajar_intensidad",
                        "label": "Bajar intensidad",
                        "effects": {"fatigue": -3, "morale": 1},
                    },
                ],
                content_kind="staff",
            )
            if event:
                created.append(event)
                decision_created = True

        if weekday == 2 and not _event_exists(conn, int(team_id), "scouting_update", day):
            event = _create_daily_event(
                conn,
                int(team_id),
                day,
                "scouting_update",
                "Informe de scouting",
                "El jefe de scouting sugiere priorizar objetivos para los proximos dias.",
                options=[
                    {
                        "key": "foco_jovenes",
                        "label": "Priorizar jovenes",
                        "effects": {"reputation": 2, "budget": -25000},
                    },
                    {
                        "key": "foco_listos",
                        "label": "Buscar impacto inmediato",
                        "effects": {"board_confidence": 1, "budget": -20000},
                    },
                    {
                        "key": "ahorrar",
                        "label": "Ahorrar presupuesto",
                        "effects": {"budget": 0},
                    },
                ],
                content_kind="scouting",
            )
            if event:
                created.append(event)
                decision_created = True

        if weekday == 4 and not _event_exists(conn, int(team_id), "locker_room", day):
            event = _create_daily_event(
                conn,
                int(team_id),
                day,
                "locker_room",
                "Estado del vestuario",
                "El capitan pide una reunion para reforzar cohesion.",
                options=[
                    {
                        "key": "reunion_equipo",
                        "label": "Organizar reunion",
                        "effects": {"cohesion": 3, "morale": 2, "fatigue": 1},
                    },
                    {
                        "key": "delegar",
                        "label": "Delegar en capitanes",
                        "effects": {"cohesion": 2, "morale": 1},
                    },
                    {
                        "key": "ignorar",
                        "label": "No intervenir",
                        "effects": {"morale": -1},
                    },
                ],
                content_kind="locker",
            )
            if event:
                created.append(event)
                decision_created = True

        fatigue = int(data.get("fatigue") or 0)
        morale = int(data.get("morale") or 50)
        if fatigue >= 75 and not _event_exists(conn, int(team_id), "recovery_request", day):
            event = _create_daily_event(
                conn,
                int(team_id),
                day,
                "recovery_request",
                "Peticion de descanso",
                "El cuerpo medico recomienda reducir la carga por fatiga elevada.",
                options=[
                    {
                        "key": "descanso_extra",
                        "label": "Dar descanso",
                        "effects": {"fatigue": -6, "recovery": 3, "prep": -1},
                    },
                    {
                        "key": "mantener",
                        "label": "Mantener plan",
                        "effects": {"fatigue": 2, "morale": -1},
                    },
                ],
                content_kind="medical",
            )
            if event:
                created.append(event)
                decision_created = True

        if morale <= 35 and not _event_exists(conn, int(team_id), "morale_dip", day):
            event = _create_daily_event(
                conn,
                int(team_id),
                day,
                "morale_dip",
                "Bajon de moral",
                "El vestuario necesita una charla para recuperar confianza.",
                options=[
                    {
                        "key": "team_talk",
                        "label": "Charla motivacional",
                        "effects": {"morale": 4, "cohesion": 1, "fatigue": 1},
                    },
                    {
                        "key": "delegar",
                        "label": "Delegar en capitanes",
                        "effects": {"morale": 2},
                    },
                    {
                        "key": "ignorar",
                        "label": "No intervenir",
                        "effects": {"morale": -2},
                    },
                ],
                content_kind="locker",
            )
            if event:
                created.append(event)
                decision_created = True

        rng = random.Random(f"{team_id}:{day}:daily")
        if not created and rng.random() < 0.35 and not _event_exists(conn, int(team_id), "media_question", day):
            event = _create_daily_event(
                conn,
                int(team_id),
                day,
                "media_question",
                "Pregunta de prensa",
                "Los medios preguntan por el estado actual del proyecto.",
                options=[
                    {
                        "key": "positivo",
                        "label": "Mensaje positivo",
                        "effects": {"reputation": 3, "board_confidence": 1},
                    },
                    {
                        "key": "realista",
                        "label": "Mensaje realista",
                        "effects": {"reputation": 1},
                    },
                    {
                        "key": "no_comment",
                        "label": "Sin comentarios",
                        "effects": {"reputation": -1},
                    },
                ],
                content_kind="media",
            )
            if event:
                created.append(event)
                decision_created = True

    if day and team_id and not decision_created:
        pending = gm_repo.list_decisions(conn, int(team_id), state="pending", limit=1)
        if not pending:
            training_sessions = int(training_summary.get("sessions") or 0)
            market_resolved = int(market_summary.get("resolved") or 0)
            match_home = match_summary.get("homeId") or match_summary.get("home_id")
            match_away = match_summary.get("awayId") or match_summary.get("away_id")
            match_home_score = match_summary.get("homeScore") or match_summary.get("home_score")
            match_away_score = match_summary.get("awayScore") or match_summary.get("away_score")
            match_has_score = match_home_score is not None and match_away_score is not None

            if match_home and match_away and match_has_score and not _event_exists(conn, int(team_id), "post_match_review", day):
                is_home = str(match_home) == str(team_id)
                won = bool(match_home_score > match_away_score) if is_home else bool(match_away_score > match_home_score)
                result_label = "victoria" if won else "derrota"
                event = _create_daily_event(
                    conn,
                    int(team_id),
                    day,
                    "post_match_review",
                    "Analisis post-partido",
                    f"Tras la {result_label}, toca decidir el enfoque del proximo tramo.",
                    options=[
                        {
                            "key": "reforzar_confianza",
                            "label": "Reforzar confianza",
                            "effects": {"morale": 3, "cohesion": 1},
                        },
                        {
                            "key": "apretar_defensa",
                            "label": "Apretar defensa",
                            "effects": {"tactical": 2, "fatigue": 2},
                        },
                        {
                            "key": "cuidar_carga",
                            "label": "Bajar carga",
                            "effects": {"fatigue": -3, "recovery": 2},
                        },
                    ],
                    content_kind="match",
                )
                if event:
                    created.append(event)
                    decision_created = True
            elif market_resolved > 0 and not _event_exists(conn, int(team_id), "market_followup", day):
                event = _create_daily_event(
                    conn,
                    int(team_id),
                    day,
                    "market_followup",
                    "Movimiento en el mercado",
                    "Se han resuelto movimientos recientes. Decide el siguiente paso.",
                    options=[
                        {
                            "key": "agresivo",
                            "label": "Acelerar fichajes",
                            "effects": {"budget": -50000, "reputation": 2},
                        },
                        {
                            "key": "equilibrado",
                            "label": "Mantener ritmo",
                            "effects": {"reputation": 1},
                        },
                        {
                            "key": "pausar",
                            "label": "Pausar mercado",
                            "effects": {"budget": 0},
                        },
                    ],
                    content_kind="market",
                )
                if event:
                    created.append(event)
                    decision_created = True
            elif training_sessions == 0 and not _event_exists(conn, int(team_id), "rest_day_plan", day):
                event = _create_daily_event(
                    conn,
                    int(team_id),
                    day,
                    "rest_day_plan",
                    "Dia de descanso",
                    "Sin sesiones programadas. Decide como aprovechar el dia.",
                    options=[
                        {
                            "key": "recuperacion_total",
                            "label": "Recuperacion total",
                            "effects": {"fatigue": -4, "recovery": 2},
                        },
                        {
                            "key": "video",
                            "label": "Video y scouting",
                            "effects": {"tactical": 2, "prep": 1},
                        },
                    ],
                    content_kind="training",
                )
                if event:
                    created.append(event)
                    decision_created = True
            elif not _event_exists(conn, int(team_id), "daily_focus", day):
                event = _create_daily_event(
                    conn,
                    int(team_id),
                    day,
                    "daily_focus",
                    "Enfoque del dia",
                    "Define la prioridad del dia para el grupo.",
                    options=[
                        {
                            "key": "ofensiva",
                            "label": "Enfoque ofensivo",
                            "effects": {"tactical": 2, "prep": 1, "fatigue": 1},
                        },
                        {
                            "key": "defensa",
                            "label": "Enfoque defensivo",
                            "effects": {"tactical": 2, "cohesion": 1, "fatigue": 1},
                        },
                        {
                            "key": "quimica",
                            "label": "Cohesion",
                            "effects": {"cohesion": 3, "morale": 1},
                        },
                    ],
                    content_kind="daily",
                )
                if event:
                    created.append(event)
                    decision_created = True

    metrics = {
        "league_position": int(data.get("league_position") or 0),
        "cup_round": int(data.get("cup_round") or 0),
        "youth_promoted": int(data.get("youth_promoted") or 0),
        "year_balance": int(data.get("year_balance") or 0),
        "payroll_percentage": int(data.get("payroll_percentage") or 0),
        "attendance_percentage": int(data.get("attendance_percentage") or 0),
    }
    _update_objectives_progress(data, metrics)
    _evaluate_objectives_if_due(conn, int(team_id), data, day, metrics)

    if day:
        board_confidence = int(data.get("board_confidence") or 70)
        morale = int(data.get("morale") or 50)
        if board_confidence <= 45 and not _event_exists(conn, int(team_id), "board_meeting_request", day):
            requester, role = _pick_board_contact(data)
            event = _create_meeting_request(
                conn,
                int(team_id),
                day,
                {
                    "type": "board",
                    "requester": requester,
                    "requesterRole": role,
                    "topic": "Revision de proyecto",
                    "urgency": "high",
                    "message": "La directiva solicita una reunion urgente para revisar el rumbo del club.",
                },
                event_type="board_meeting_request",
            )
            if event:
                created.append(event)
                decision_created = True
        if morale <= 35 and not _event_exists(conn, int(team_id), "locker_meeting_request", day):
            player_name, player_role = _pick_team_player(conn, int(team_id))
            event = _create_meeting_request(
                conn,
                int(team_id),
                day,
                {
                    "type": "player",
                    "requester": player_name,
                    "requesterRole": player_role,
                    "topic": "Estado del vestuario",
                    "urgency": "medium",
                    "message": "El capitan pide una charla para mejorar el ambiente del vestuario.",
                },
                event_type="locker_meeting_request",
            )
            if event:
                created.append(event)
                decision_created = True

        reputation = int(data.get("reputation") or 0)
        rng = random.Random(f"{team_id}:{day}:scandal")
        if reputation <= 240 and rng.random() < 0.12 and not _event_exists(conn, int(team_id), "media_scandal", day):
            _create_scandal(
                conn,
                int(team_id),
                day,
                "Rumores de crisis interna",
                "La prensa duda de la estabilidad del proyecto tras los ultimos resultados.",
            )

    if day:
        _update_fan_pulse(conn, int(team_id), data, day, summary)

    gm_state = data.get("gm_state") if isinstance(data.get("gm_state"), dict) else {}
    stress = int(gm_state.get("stress") or 35)
    stress_delta = 0
    if int(data.get("board_confidence") or 70) < 55:
        stress_delta += 3
    if int(data.get("morale") or 50) < 45:
        stress_delta += 2
    if match_summary.get("homeScore") is not None and match_summary.get("awayScore") is not None:
        home_score = int(match_summary.get("homeScore") or 0)
        away_score = int(match_summary.get("awayScore") or 0)
        is_home = str(match_summary.get("homeId")) == str(team_id)
        won = home_score > away_score if is_home else away_score > home_score
        stress_delta += -3 if won else 4
    if decision_created:
        stress_delta += 1
    stress = max(0, min(100, stress + stress_delta))
    gm_state["stress"] = stress
    gm_state["energy"] = max(0, min(100, int(gm_state.get("energy") or 70) - 1 + (1 if stress < 35 else 0)))
    data["gm_state"] = gm_state

    if day and day.endswith("-01"):
        finances = data.get("gm_finances") if isinstance(data.get("gm_finances"), dict) else {}
        last_pay = finances.get("last_pay_date") or ""
        if last_pay != day:
            salary = int(finances.get("salary") or 0)
            funds = int(finances.get("funds") or 0) + salary
            finances["funds"] = funds
            finances["last_pay_date"] = day
            data["gm_finances"] = finances
    items = gm_repo.list_events(conn, int(team_id), limit=40)
    has_briefing = any(
        str(item.get("event_type")) == "daily_briefing" and str(item.get("event_date")) == day
        for item in items
    )
    if not has_briefing:
        title = summary.get("title") or f"Informe diario {day}"
        body = summary.get("body") or ""
        if not str(body).strip():
            body = "Jornada sin eventos relevantes."
        event = gm_repo.create_event(
            conn,
            team_id=team_id,
            event_type="daily_briefing",
            severity="info",
            state="open",
            title=title,
            body=body,
            event_date=day,
            data={"origin": "system", "summary": summary},
        )
        created.append(event)
        try:
            _ensure_smartphone_content(conn)
            smartphone_content_repo.create_content(
                conn,
                content_type="news",
                data={
                    "title": title,
                    "content": body,
                    "timestamp": day,
                    "type": "briefing",
                    "source": "gm",
                    "event_id": event.get("id"),
                },
                team_id=int(team_id),
                created_at=int(time.time()),
            )
        except Exception:
            pass

    if day:
        try:
            parsed = datetime.strptime(day, "%Y-%m-%d").date()
            data["current_date"] = (parsed + timedelta(days=1)).isoformat()
        except Exception:
            data["current_date"] = day
        conn.execute(
            "UPDATE team SET data_json = ?, updated_at = ? WHERE id = ?",
            (json.dumps(data, ensure_ascii=True), int(time.time()), int(team_id)),
        )
        conn.commit()

    return {"ok": True, "events": created}


def record_injury_events(
    conn: sqlite3.Connection,
    team_id: Optional[int],
    injuries: List[Dict[str, Any]],
    current_date: Optional[str] = None,
    source: str = "training",
) -> List[Dict[str, Any]]:
    _ensure_tables(conn)
    if not injuries or not team_id:
        return []
    ids = [int(item["player_id"]) for item in injuries if item.get("player_id") is not None]
    if not ids:
        return []
    placeholders = ",".join("?" for _ in ids)
    rows = conn.execute(
        f"SELECT id, name FROM player WHERE id IN ({placeholders})",
        ids,
    ).fetchall()
    name_map = {int(row["id"]): row["name"] for row in rows}
    created: List[Dict[str, Any]] = []
    for injury in injuries:
        player_id = int(injury.get("player_id") or 0)
        player_name = name_map.get(player_id) or ""
        days = int(injury.get("days") or 0)
        severity = str(injury.get("severity") or "minor")
        severity_label = "low" if severity == "minor" else "medium" if severity == "moderate" else "high"
        label = injury.get("label") or "Lesion"
        title = f"Lesion: {player_name}".strip()
        body = f"{label} - Baja {days} dias."
        event = gm_repo.create_event(
            conn,
            team_id=team_id,
            event_type="injury",
            severity=severity_label,
            state="open",
            title=title,
            body=body,
            event_date=current_date or injury.get("start_date") or "",
            data={"origin": "system", "source": source, "injury": injury},
        )
        created.append(event)
        if source == "training":
            try:
                _ensure_smartphone_content(conn)
                smartphone_content_repo.create_content(
                    conn,
                    content_type="news",
                    data={
                        "title": title,
                        "content": body,
                        "timestamp": current_date or injury.get("start_date") or "",
                        "type": "injury",
                        "source": "training",
                        "event_id": event.get("id"),
                    },
                    team_id=int(team_id),
                    created_at=int(time.time()),
                )
            except Exception:
                pass
    return created
