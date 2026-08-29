from __future__ import annotations

import json
import sys
import sqlite3
import math
import time
import threading
import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from ..repo import player_repo
from ..services import competition_service, health_service, smartphone_service, gm_service, club_service
from ..repo import gm_repo
from ..sim import simulate_match


_RUN_STATE = {
    "paused": False,
    "active": False,
    "run_id": None,
    "speed_ms": 0,
    "realtime_factor": 1.0,
    "actions": [],
    # Fast-forward: run as fast as possible (no sleeps), optionally without tick emissions/positions.
    "fast_forward": False,
    "emit_ticks": True,
    "tick_cb": None,
}
_RUN_LOCK = threading.Lock()


def _parse_date(value: str | None) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except Exception:
        return None


def _clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


def _get_team(conn: sqlite3.Connection, team_id: int) -> Optional[Dict[str, Any]]:
    row = conn.execute("SELECT id, name, data_json FROM team WHERE id = ?", (int(team_id),)).fetchone()
    if not row:
        return None
    return {"id": int(row["id"]), "name": row["name"], "data": json.loads(row["data_json"]) if row["data_json"] else {}}


def _fixture_meta(conn: sqlite3.Connection, fixture_id: int) -> Dict[str, Any]:
    row = conn.execute(
        "SELECT f.id, f.date, f.season_id, f.competition_id, c.league_id "
        "FROM fixture f JOIN competition c ON c.id = f.competition_id WHERE f.id = ?",
        (int(fixture_id),),
    ).fetchone()
    if not row:
        return {}
    return {
        "fixture_id": int(row["id"]),
        "fixture_date": row["date"],
        "season_id": int(row["season_id"]) if row["season_id"] is not None else None,
        "competition_id": int(row["competition_id"]) if row["competition_id"] is not None else None,
        "league_id": row["league_id"],
    }


def _is_player_out(player_data: Dict[str, Any]) -> bool:
    health = player_data.get("health") or {}
    status = str(health.get("injury_status") or health.get("status") or "").lower()
    return status == "out"


def _filter_roster(players: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    available = [p for p in players if not _is_player_out(p.get("data") or {})]
    if len(available) >= 5:
        return available
    return players


def _order_roster(players: List[Dict[str, Any]], ordered_ids: List[int] | None) -> List[Dict[str, Any]]:
    if not players or not ordered_ids:
        return players
    want = [int(x) for x in ordered_ids if x is not None]
    by_id = {int(p.get("id") or 0): p for p in players}
    out: List[Dict[str, Any]] = []
    seen = set()
    for pid in want:
        p = by_id.get(pid)
        if p and pid not in seen:
            out.append(p)
            seen.add(pid)
    for p in players:
        pid = int(p.get("id") or 0)
        if pid and pid not in seen:
            out.append(p)
            seen.add(pid)
    return out


def _update_team_morale(conn: sqlite3.Connection, team_id: int, delta: int) -> int:
    row = conn.execute("SELECT data_json FROM team WHERE id = ?", (int(team_id),)).fetchone()
    if not row:
        return 50
    data = json.loads(row["data_json"]) if row["data_json"] else {}
    morale = int(data.get("morale") or 50)
    morale = _clamp(morale + int(delta), 0, 100)
    data["morale"] = morale
    conn.execute(
        "UPDATE team SET data_json = ?, updated_at = ? WHERE id = ?",
        (json.dumps(data, ensure_ascii=True), int(time.time()), int(team_id)),
    )
    conn.commit()
    return morale


def _update_team_reputation(conn: sqlite3.Connection, team_id: int, delta: int) -> int:
    row = conn.execute("SELECT data_json FROM team WHERE id = ?", (int(team_id),)).fetchone()
    if not row:
        return 0
    data = json.loads(row["data_json"]) if row["data_json"] else {}
    reputation = int(data.get("reputation") or 0)
    reputation = _clamp(reputation + int(delta), 0, 1000)
    data["reputation"] = reputation
    conn.execute(
        "UPDATE team SET data_json = ?, updated_at = ? WHERE id = ?",
        (json.dumps(data, ensure_ascii=True), int(time.time()), int(team_id)),
    )
    conn.commit()
    return reputation


def _update_team_budget(conn: sqlite3.Connection, team_id: int, delta: int) -> int:
    row = conn.execute("SELECT data_json FROM team WHERE id = ?", (int(team_id),)).fetchone()
    if not row:
        return 0
    data = json.loads(row["data_json"]) if row["data_json"] else {}
    budget = int(data.get("budget") or 0)
    budget = int(budget + int(delta))
    data["budget"] = budget
    conn.execute(
        "UPDATE team SET data_json = ?, updated_at = ? WHERE id = ?",
        (json.dumps(data, ensure_ascii=True), int(time.time()), int(team_id)),
    )
    conn.commit()
    return budget


def _team_league_id(team: Optional[Dict[str, Any]]) -> str:
    raw = (team or {}).get("data", {}).get("league_id") or (team or {}).get("data", {}).get("league") or ""
    return str(raw or "FIBA").upper()


def _match_revenue_base(league_id: str) -> int:
    league_id = str(league_id or "").upper()
    mapping = {
        "NBA": 1_200_000,
        "WNBA": 180_000,
        "NCAA_M": 150_000,
        "NCAA_W": 120_000,
        "ACB": 260_000,
        "FEB": 70_000,
    }
    return int(mapping.get(league_id, 60_000))


def _apply_match_finances(
    conn: sqlite3.Connection,
    team: Optional[Dict[str, Any]],
    won: bool,
    is_home: bool,
) -> int:
    if not team:
        return 0
    team_id = int(team.get("id") or 0)
    if not team_id:
        return 0
    data = team.get("data") or {}
    league_id = _team_league_id(team)
    base = float(_match_revenue_base(league_id))
    if not is_home:
        base *= 0.18
    facilities = data.get("facilities") or {}
    facility_bonuses = club_service.calculate_facility_bonuses(facilities) if facilities else {}
    ticket_income = float(facility_bonuses.get("ticket_income") or 0.0)
    sponsor_bonus = float(facility_bonuses.get("sponsor_bonus") or 0.0)
    if is_home and ticket_income:
        base += ticket_income
    reputation = float(data.get("reputation") or 0)
    rep_mult = 0.85 + (reputation / 2000.0)
    tier = int(data.get("tier") or 3)
    tier_mult = 1.15 if tier <= 2 else 1.0 if tier <= 4 else 0.88
    win_mult = 1.06 if won else 0.98
    revenue = int(base * rep_mult * tier_mult * win_mult * (1.0 + sponsor_bonus))
    if revenue == 0:
        return 0
    _update_team_budget(conn, team_id, revenue)
    _log_match_news(
        conn,
        team_id,
        "Ingresos de partido",
        f"Impacto financiero del partido: +{revenue}.",
        impact={"budget": revenue},
    )
    return revenue


def _persist_match_result(
    conn: sqlite3.Connection,
    result: Dict[str, Any],
    home_id: int,
    away_id: int,
    fixture_id: Optional[int],
    record_fixture: bool = False,
    meta: Optional[Dict[str, Any]] = None,
) -> Optional[int]:
    if not result or not result.get("score"):
        return None
    now = int(time.time())
    home_score = int(result.get("score", {}).get("home") or 0)
    away_score = int(result.get("score", {}).get("away") or 0)
    possessions = int(result.get("possessions") or 0)
    meta = meta or {}
    data = {
        "ruleset": result.get("ruleset"),
        "team_stats": result.get("team_stats"),
        "team_totals": result.get("team_totals"),
        "score_by_quarter": result.get("score_by_quarter"),
        "score_by_period": result.get("score_by_period"),
        "highlights": result.get("highlights"),
        "period_count": result.get("period_count"),
        "period_seconds": result.get("period_seconds"),
        "ot_seconds": result.get("ot_seconds"),
        "player_stats": result.get("player_stats"),
        "lineups": result.get("lineups"),
        "fixture_id": fixture_id,
        "fixture_date": meta.get("fixture_date") or meta.get("date"),
        "competition_id": meta.get("competition_id"),
        "season_id": meta.get("season_id"),
        "league_id": meta.get("league_id"),
    }
    cur = conn.execute(
        "INSERT INTO match (home_team_id, away_team_id, home_score, away_score, possessions, data_json, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            int(home_id),
            int(away_id),
            home_score,
            away_score,
            possessions,
            json.dumps(data, ensure_ascii=True),
            now,
        ),
    )
    match_id = int(cur.lastrowid)
    events = result.get("play_by_play") or []
    for idx, evt in enumerate(events):
        conn.execute(
            "INSERT INTO event_log (match_id, seq, clock, team, event, data_json) VALUES (?, ?, ?, ?, ?, ?)",
            (
                match_id,
                idx + 1,
                int(evt.get("clock") or 0),
                str(evt.get("team") or ""),
                str(evt.get("event") or ""),
                json.dumps(evt, ensure_ascii=True),
            ),
        )
    conn.commit()
    result["match_id"] = match_id
    if record_fixture and fixture_id:
        competition_service.record_result(
            conn,
            {
                "fixture_id": fixture_id,
                "home_score": home_score,
                "away_score": away_score,
            },
        )
    return match_id


def _event_points(evt: Dict[str, Any]) -> int:
    et = str(evt.get("event") or "")
    if et in ("2pt_make", "putback_make"):
        return 2
    if et == "3pt_make":
        return 3
    if et == "goaltending":
        try:
            return int(evt.get("pts") or 0)
        except Exception:
            return 0
    if et == "foul":
        try:
            return int(evt.get("ftm") or 0)
        except Exception:
            return 0
    if et == "defensive_three_seconds":
        try:
            return int(evt.get("ftm") or 0)
        except Exception:
            return 0
    return 0


def _build_highlights(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    highlights: List[Dict[str, Any]] = []
    score = {"home": 0, "away": 0}
    run_team: Optional[str] = None
    run_pts = 0
    run_start_seq = 1
    last_lead = 0  # home-away
    for idx, evt in enumerate(events or []):
        team = str(evt.get("team") or "")
        pts = _event_points(evt)
        if pts > 0 and team in ("home", "away"):
            score[team] += int(pts)
            lead = int(score["home"] - score["away"])
            # Runs (8-0+)
            if run_team == team:
                run_pts += int(pts)
            else:
                if run_team and run_pts >= 8:
                    highlights.append({"type": "run", "team": run_team, "pts": int(run_pts), "start_seq": int(run_start_seq), "end_seq": int(idx)})
                run_team = team
                run_pts = int(pts)
                run_start_seq = int(idx + 1)
            # Lead changes / clutch
            try:
                clock = float(evt.get("clock") or 0.0)
            except Exception:
                clock = 0.0
            if (last_lead == 0 and lead != 0) or (last_lead > 0 and lead < 0) or (last_lead < 0 and lead > 0):
                highlights.append({"type": "lead_change", "seq": int(idx + 1), "score": dict(score), "clock": clock})
            if clock <= 120 and abs(lead) <= 5:
                highlights.append({"type": "clutch_score", "team": team, "pts": int(pts), "seq": int(idx + 1), "score": dict(score), "clock": clock})
            last_lead = lead
        else:
            et = str(evt.get("event") or "")
            if et in ("block", "charge", "five_seconds_violation", "goaltending"):
                try:
                    clock = float(evt.get("clock") or 0.0)
                except Exception:
                    clock = 0.0
                highlights.append({"type": et, "seq": int(idx + 1), "team": team, "clock": clock})

    if run_team and run_pts >= 8:
        highlights.append({"type": "run", "team": run_team, "pts": int(run_pts), "start_seq": int(run_start_seq), "end_seq": int(len(events))})
    # De-dup common spam by collapsing identical highlight records.
    seen = set()
    out: List[Dict[str, Any]] = []
    for h in highlights:
        key = json.dumps(h, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        out.append(h)
    return out


def _save_team_tactics(
    conn: sqlite3.Connection,
    team_id: int,
    tactics: Dict[str, Any] | None,
    rotation: Dict[str, Any] | None,
    playbook: Dict[str, Any] | None,
) -> None:
    if not team_id:
        return
    row = conn.execute("SELECT data_json FROM team WHERE id = ?", (int(team_id),)).fetchone()
    if not row:
        return
    data = json.loads(row["data_json"]) if row["data_json"] else {}
    data["match_tactics"] = {
        "tactics": tactics or {},
        "rotation": rotation or {},
        "playbook": playbook or {},
        "updated_at": int(time.time()),
    }
    conn.execute(
        "UPDATE team SET data_json = ?, updated_at = ? WHERE id = ?",
        (json.dumps(data, ensure_ascii=True), int(time.time()), int(team_id)),
    )
    conn.commit()


def _load_team_tactics(team_data: Dict[str, Any]) -> Dict[str, Any]:
    return team_data.get("match_tactics") or {}


def _log_match_news(conn: sqlite3.Connection, team_id: int, title: str, content: str, impact: Dict[str, Any] | None = None) -> None:
    try:
        smartphone_service.create_content(
            conn,
            {
                "team_id": int(team_id),
                "content_type": "news",
                "data": {
                    "title": title,
                    "content": content,
                    "impact": impact or {},
                    "created_at": int(time.time()),
                    "type": "match",
                },
            },
        )
    except Exception:
        return


def _log_match_event(
    conn: sqlite3.Connection,
    team_id: int,
    title: str,
    body: str,
    event_date: str,
    severity: str = "info",
    data: Dict[str, Any] | None = None,
) -> None:
    try:
        gm_service._ensure_tables(conn)
        gm_repo.create_event(
            conn,
            team_id=int(team_id),
            event_type="match_result",
            severity=severity,
            state="open",
            title=title,
            body=body,
            event_date=event_date,
            data=data or {},
        )
    except Exception:
        return


def _apply_post_match(
    conn: sqlite3.Connection,
    result: Dict[str, Any],
    home_id: int,
    away_id: int,
    current_date: date,
    home_team: Optional[Dict[str, Any]],
    away_team: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    score = result.get("score") or {}
    home_score = int(score.get("home") or 0)
    away_score = int(score.get("away") or 0)
    home_won = home_score > away_score

    _update_team_morale(conn, int(home_id), 4 if home_won else -4)
    _update_team_morale(conn, int(away_id), 4 if not home_won else -4)

    injuries_home = health_service.apply_match_effects(
        conn,
        team_id=int(home_id),
        player_stats=(result.get("player_stats") or {}).get("home") or [],
        won=home_won,
        current_date=current_date,
    )
    injuries_away = health_service.apply_match_effects(
        conn,
        team_id=int(away_id),
        player_stats=(result.get("player_stats") or {}).get("away") or [],
        won=not home_won,
        current_date=current_date,
    )

    for injury in injuries_home.get("injuries") or []:
        _log_match_news(
            conn,
            int(home_id),
            f"Parte medico: {injury.get('label')}",
            f"{injury.get('label')} - Baja {injury.get('days')} dias.",
            impact={"morale": -2},
        )
    for injury in injuries_away.get("injuries") or []:
        _log_match_news(
            conn,
            int(away_id),
            f"Parte medico: {injury.get('label')}",
            f"{injury.get('label')} - Baja {injury.get('days')} dias.",
            impact={"morale": -2},
        )

    home_tier = int((home_team or {}).get("data", {}).get("tier") or 3)
    away_tier = int((away_team or {}).get("data", {}).get("tier") or 3)
    if abs(home_tier - away_tier) >= 2:
        underdog = home_id if home_tier > away_tier else away_id
        if (home_won and underdog == home_id) or ((not home_won) and underdog == away_id):
            winner_name = (home_team or {}).get("name") or "Local"
            loser_name = (away_team or {}).get("name") or "Visitante"
            if underdog == away_id:
                winner_name = (away_team or {}).get("name") or "Visitante"
                loser_name = (home_team or {}).get("name") or "Local"
            _log_match_news(
                conn,
                int(underdog),
                "Sorpresa de la jornada",
                f"{winner_name} vence a {loser_name} contra pronostico.",
                impact={"morale": 3},
            )
            if underdog == home_id:
                _update_team_reputation(conn, int(home_id), 6)
                _update_team_reputation(conn, int(away_id), -4)
            else:
                _update_team_reputation(conn, int(away_id), 6)
                _update_team_reputation(conn, int(home_id), -4)
        else:
            if underdog == home_id:
                _update_team_reputation(conn, int(home_id), -2)
                _update_team_reputation(conn, int(away_id), 2)
            else:
                _update_team_reputation(conn, int(away_id), -2)
                _update_team_reputation(conn, int(home_id), 2)

    home_name = (home_team or {}).get("name") or "Local"
    away_name = (away_team or {}).get("name") or "Visitante"
    result_title = f"Resultado: {home_name} {home_score}-{away_score} {away_name}"
    _log_match_news(
        conn,
        int(home_id),
        result_title,
        f"{home_name} {home_score}-{away_score} {away_name}.",
        impact={"morale": 2 if home_won else -2},
    )
    _log_match_news(
        conn,
        int(away_id),
        result_title,
        f"{home_name} {home_score}-{away_score} {away_name}.",
        impact={"morale": 2 if not home_won else -2},
    )

    event_date = current_date.isoformat()
    result_body = f"{home_name} {home_score}-{away_score} {away_name}."
    margin = abs(home_score - away_score)
    severity = "high" if margin >= 20 else "medium" if margin >= 10 else "info"
    _log_match_event(
        conn,
        int(home_id),
        result_title,
        result_body,
        event_date,
        severity=severity,
        data={
            "home_id": int(home_id),
            "away_id": int(away_id),
            "home_score": home_score,
            "away_score": away_score,
            "won": home_won,
        },
    )
    _log_match_event(
        conn,
        int(away_id),
        result_title,
        result_body,
        event_date,
        severity=severity,
        data={
            "home_id": int(home_id),
            "away_id": int(away_id),
            "home_score": home_score,
            "away_score": away_score,
            "won": not home_won,
        },
    )

    _apply_match_finances(conn, home_team, home_won, True)
    _apply_match_finances(conn, away_team, not home_won, False)

    if abs(home_tier - away_tier) < 2:
        _update_team_reputation(conn, int(home_id), 4 if home_won else -3)
        _update_team_reputation(conn, int(away_id), 4 if not home_won else -3)

    return {
        "home_score": home_score,
        "away_score": away_score,
        "home_won": home_won,
        "injuries_home": injuries_home.get("injuries") or [],
        "injuries_away": injuries_away.get("injuries") or [],
    }


def control(payload: Dict[str, Any]) -> Dict[str, Any]:
    action = str(payload.get("action") or "").lower()
    speed_ms = payload.get("speed_ms")
    realtime_factor = payload.get("realtime_factor")
    fast_forward = payload.get("fast_forward")
    emit_ticks = payload.get("emit_ticks")
    skip_positions = payload.get("skip_positions")
    with _RUN_LOCK:
        if not _RUN_STATE["active"]:
            return {"active": False, "paused": False}
        if action == "pause":
            _RUN_STATE["paused"] = True
            _RUN_STATE["fast_forward"] = False
            _RUN_STATE["emit_ticks"] = True
            cb = _RUN_STATE.get("tick_cb")
            if cb is not None:
                try:
                    setattr(cb, "skip_positions", False)
                except Exception:
                    pass
        elif action == "resume":
            _RUN_STATE["paused"] = False
            _RUN_STATE["fast_forward"] = False
            _RUN_STATE["emit_ticks"] = True
            cb = _RUN_STATE.get("tick_cb")
            if cb is not None:
                try:
                    setattr(cb, "skip_positions", False)
                except Exception:
                    pass
        elif action == "fast_forward":
            _RUN_STATE["paused"] = False
            _RUN_STATE["fast_forward"] = True
            _RUN_STATE["emit_ticks"] = bool(emit_ticks) if emit_ticks is not None else False
            cb = _RUN_STATE.get("tick_cb")
            if cb is not None:
                try:
                    setattr(cb, "skip_positions", True if skip_positions is None else bool(skip_positions))
                except Exception:
                    pass
        if fast_forward is not None:
            _RUN_STATE["fast_forward"] = bool(fast_forward)
            if not bool(fast_forward):
                _RUN_STATE["emit_ticks"] = True
                cb = _RUN_STATE.get("tick_cb")
                if cb is not None:
                    try:
                        setattr(cb, "skip_positions", False)
                    except Exception:
                        pass
        if emit_ticks is not None:
            _RUN_STATE["emit_ticks"] = bool(emit_ticks)
        if skip_positions is not None:
            cb = _RUN_STATE.get("tick_cb")
            if cb is not None:
                try:
                    setattr(cb, "skip_positions", bool(skip_positions))
                except Exception:
                    pass
        if speed_ms is not None:
            try:
                _RUN_STATE["speed_ms"] = max(0, int(speed_ms))
            except Exception:
                pass
        if realtime_factor is not None:
            try:
                factor = float(realtime_factor)
                if math.isfinite(factor):
                    _RUN_STATE["realtime_factor"] = max(0.25, min(16.0, factor))
            except Exception:
                pass
        return {
            "active": True,
            "paused": bool(_RUN_STATE["paused"]),
            "fast_forward": bool(_RUN_STATE.get("fast_forward")),
            "emit_ticks": bool(_RUN_STATE.get("emit_ticks")),
        }

def action(payload: Dict[str, Any]) -> Dict[str, Any]:
    action_type = str(payload.get("action") or payload.get("type") or "").lower()
    team = str(payload.get("team") or "home").lower()
    if action_type == "":
        return {"ok": False, "error": {"message": "action is required"}}
    with _RUN_LOCK:
        if not _RUN_STATE["active"]:
            return {"ok": False, "error": {"message": "no active match"}}
        if action_type == "timeout":
            _RUN_STATE["paused"] = True
        _RUN_STATE["actions"].append(
            {
                "action": action_type,
                "team": team,
                "team_label": payload.get("team_label"),
                "label": payload.get("label"),
                "focus": payload.get("focus"),
                "ptype": payload.get("ptype"),
                "patch": payload.get("patch"),
                "timeout_kind": payload.get("timeout_kind"),
                "out_id": payload.get("out_id"),
                "in_id": payload.get("in_id"),
                "seconds": payload.get("seconds"),
            }
        )
    return {"ok": True}

def _pop_actions(run_id: str) -> list[dict]:
    with _RUN_LOCK:
        if _RUN_STATE.get("run_id") != run_id:
            return []
        actions = list(_RUN_STATE.get("actions") or [])
        _RUN_STATE["actions"] = []
    return actions


def simulate(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    home_id = payload.get("home_team_id")
    away_id = payload.get("away_team_id")
    fixture_id = payload.get("fixture_id")
    if home_id is None or away_id is None:
        raise ValueError("home_team_id and away_team_id are required")

    seed = payload.get("seed")
    ruleset = payload.get("ruleset") or "FIBA"

    rotation_home = payload.get("rotation_home") or payload.get("rotation")
    rotation_away = payload.get("rotation_away")
    playbook_home = payload.get("playbook_home") or payload.get("playbook")
    playbook_away = payload.get("playbook_away")
    tactics_home = payload.get("tactics_home") or payload.get("tactics")
    tactics_away = payload.get("tactics_away")
    stream = bool(payload.get("stream"))

    home_team = _get_team(conn, int(home_id))
    away_team = _get_team(conn, int(away_id))
    fixture_meta: Dict[str, Any] = {}
    if fixture_id:
        fixture_meta = _fixture_meta(conn, int(fixture_id))
    home_tactics_store = _load_team_tactics(home_team.get("data") if home_team else {})
    away_tactics_store = _load_team_tactics(away_team.get("data") if away_team else {})

    if not rotation_home and home_tactics_store.get("rotation"):
        rotation_home = home_tactics_store.get("rotation")
    if not rotation_away and away_tactics_store.get("rotation"):
        rotation_away = away_tactics_store.get("rotation")
    if not playbook_home and home_tactics_store.get("playbook"):
        playbook_home = home_tactics_store.get("playbook")
    if not playbook_away and away_tactics_store.get("playbook"):
        playbook_away = away_tactics_store.get("playbook")
    if not tactics_home and home_tactics_store.get("tactics"):
        tactics_home = home_tactics_store.get("tactics")
    if not tactics_away and away_tactics_store.get("tactics"):
        tactics_away = away_tactics_store.get("tactics")

    save_tactics_team_id = payload.get("tactics_team_id")
    if save_tactics_team_id:
        save_id = int(save_tactics_team_id)
        if save_id == int(home_id):
            _save_team_tactics(conn, save_id, tactics_home, rotation_home, playbook_home)
        elif save_id == int(away_id):
            _save_team_tactics(conn, save_id, tactics_away, rotation_away, playbook_away)

    current_date = None
    if fixture_id:
        row = conn.execute("SELECT date FROM fixture WHERE id = ?", (int(fixture_id),)).fetchone()
        if row:
            current_date = _parse_date(str(row["date"] or ""))
    if not current_date:
        current_date = _parse_date(str(payload.get("current_date") or "")) or date.today()
    if current_date and not fixture_meta.get("fixture_date"):
        fixture_meta["fixture_date"] = current_date.isoformat()
    if not fixture_meta.get("league_id"):
        fixture_meta["league_id"] = _team_league_id(home_team) or _team_league_id(away_team)

    apply_post_match = bool(payload.get("apply_post_match", True))

    health_service.advance_team_injuries(conn, int(home_id), current_date)
    health_service.advance_team_injuries(conn, int(away_id), current_date)

    home_players = _filter_roster(player_repo.list_players_by_team(conn, int(home_id)))
    away_players = _filter_roster(player_repo.list_players_by_team(conn, int(away_id)))
    if len(home_players) < 5 or len(away_players) < 5:
        raise ValueError("Both teams must have at least 5 players")

    # Align engine roster ordering with UI-selected lineup/bench to keep substitutions consistent.
    home_order = (payload.get("lineup_home_ids") or []) + (payload.get("bench_home_ids") or [])
    away_order = (payload.get("lineup_away_ids") or []) + (payload.get("bench_away_ids") or [])
    home_players = _order_roster(home_players, home_order if home_order else None)
    away_players = _order_roster(away_players, away_order if away_order else None)

    def emit(event_type: str, data: Dict[str, object]) -> None:
        sys.stdout.write(json.dumps({"event": event_type, "payload": data}, ensure_ascii=True))
        sys.stdout.write("\n")
        sys.stdout.flush()

    if stream:
        emit(
            "match.start",
            {
                "home_team_id": int(home_id),
                "away_team_id": int(away_id),
                "ruleset": ruleset,
            },
        )

    delay_ms = int(payload.get("stream_delay_ms") or 0)
    tick_ms = int(payload.get("tick_ms") or 100)
    stream_realtime = bool(payload.get("stream_realtime"))
    initial_realtime_factor = payload.get("realtime_factor")

    _tick_state: Dict[str, Any] = {"count": 0, "rt_base": None, "rt_i": 0}

    def on_tick(frame: Dict[str, object]) -> None:
        """Emit each tick with a proportional delay so movement is smooth."""
        if not stream:
            return
        # Respect pause
        was_paused = False
        while True:
            with _RUN_LOCK:
                if not _RUN_STATE["paused"]:
                    break
                was_paused = True
            time.sleep(0.05)

        with _RUN_LOCK:
            fast_forward = bool(_RUN_STATE.get("fast_forward"))
            emit_ticks = bool(_RUN_STATE.get("emit_ticks", True))
        if emit_ticks:
            emit("match.tick", frame)
        if fast_forward:
            return
        if stream_realtime:
            with _RUN_LOCK:
                factor = float(_RUN_STATE.get("realtime_factor") or 1.0)
            if not math.isfinite(factor):
                factor = 1.0
            factor = max(0.25, min(16.0, factor))
            interval = (max(0.0, float(tick_ms)) / 1000.0) / factor
            if interval <= 0:
                return
            # If the user paused, don't "catch up" after resuming.
            if was_paused:
                _tick_state["rt_base"] = time.monotonic()
                _tick_state["rt_i"] = 0

            now = time.monotonic()
            base = _tick_state.get("rt_base")
            if not isinstance(base, float):
                base = now
                _tick_state["rt_base"] = base
                _tick_state["rt_i"] = 0
            i = int(_tick_state.get("rt_i") or 0) + 1
            _tick_state["rt_i"] = i
            due = float(base) + float(i) * interval
            sleep_s = due - now
            if sleep_s > 0:
                time.sleep(sleep_s)
            return
        with _RUN_LOCK:
            current_delay = int(_RUN_STATE.get("speed_ms") or delay_ms)
        if current_delay > 0:
            time.sleep(current_delay / 1000.0)

    def on_event(evt: Dict[str, object]) -> None:
        if stream:
            # Capture play-by-play for persistence.
            try:
                buf = _tick_state.get("events")
                if buf is None:
                    buf = []
                    _tick_state["events"] = buf
                if isinstance(buf, list):
                    buf.append(dict(evt))
                    if len(buf) > 5000:
                        del buf[:-5000]
            except Exception:
                pass
            if evt.get("pause"):
                with _RUN_LOCK:
                    _RUN_STATE["paused"] = True
            while True:
                with _RUN_LOCK:
                    paused = bool(_RUN_STATE["paused"])
                if evt.get("force_emit"):
                    break
                if not paused:
                    break
                time.sleep(0.05)
            _tick_state["count"] = 0
            emit("match.event", evt)
            # Only add legacy delay when no position ticks were generated
            with _RUN_LOCK:
                fast_forward = bool(_RUN_STATE.get("fast_forward"))
            if (not fast_forward) and (not gen_positions):
                with _RUN_LOCK:
                    current_delay = int(_RUN_STATE.get("speed_ms") or delay_ms)
                if current_delay > 0:
                    time.sleep(current_delay / 1000.0)

    max_quarters = payload.get("max_quarters")
    state = payload.get("state")
    period_count = payload.get("period_count")
    period_seconds = payload.get("period_seconds")
    ot_seconds = payload.get("ot_seconds")
    rules = payload.get("rules")
    gen_positions = bool(payload.get("generate_positions", stream))

    def _run_streamed(run_id: str) -> None:
        try:
            result = simulate_match(
                home_players,
                away_players,
                seed=seed,
                ruleset=ruleset,
                tactics_home=tactics_home,
                tactics_away=tactics_away,
                playbook_home=playbook_home,
                playbook_away=playbook_away,
                rotation_home=rotation_home,
                rotation_away=rotation_away,
                event_callback=on_event if stream else None,
                action_provider=lambda: _pop_actions(run_id),
                period_count=int(period_count) if period_count else None,
                period_seconds=int(period_seconds) if period_seconds else None,
                ot_seconds=int(ot_seconds) if ot_seconds else None,
                generate_positions=gen_positions,
                position_callback=on_tick if gen_positions else None,
                tick_ms=tick_ms,
            )
            try:
                events = _tick_state.get("events")
                if isinstance(events, list) and events:
                    result["play_by_play"] = events
                    result["highlights"] = _build_highlights(events)
            except Exception:
                pass
            emit("match.result", result)
            if apply_post_match and result.get("score"):
                _apply_post_match(
                    conn,
                    result=result,
                    home_id=int(home_id),
                    away_id=int(away_id),
                    current_date=current_date or date.today(),
                    home_team=home_team,
                    away_team=away_team,
                )
            if payload.get("save", True):
                _persist_match_result(
                    conn,
                    result,
                    int(home_id),
                    int(away_id),
                    int(fixture_id) if fixture_id else None,
                    record_fixture=False,
                    meta=fixture_meta,
                )
            if fixture_id and result.get("score"):
                competition_service.record_result(
                    conn,
                    {
                        "fixture_id": fixture_id,
                        "home_score": result.get("score", {}).get("home"),
                        "away_score": result.get("score", {}).get("away"),
                    },
                )
            emit(
                "match.end",
                {
                    "home_team_id": int(home_id),
                    "away_team_id": int(away_id),
                    "score": result.get("score"),
                    "run_id": run_id,
                },
            )
        finally:
            with _RUN_LOCK:
                _RUN_STATE["active"] = False
                _RUN_STATE["paused"] = False
                _RUN_STATE["run_id"] = None
                _RUN_STATE["actions"] = []
                _RUN_STATE["realtime_factor"] = 1.0
                _RUN_STATE["fast_forward"] = False
                _RUN_STATE["emit_ticks"] = True
                _RUN_STATE["tick_cb"] = None

    if stream:
        run_id = str(uuid.uuid4())
        with _RUN_LOCK:
            _RUN_STATE["active"] = True
            _RUN_STATE["paused"] = False
            _RUN_STATE["run_id"] = run_id
            _RUN_STATE["speed_ms"] = int(delay_ms)
            _RUN_STATE["fast_forward"] = False
            _RUN_STATE["emit_ticks"] = True
            _RUN_STATE["tick_cb"] = on_tick
            try:
                setattr(on_tick, "skip_positions", False)
            except Exception:
                pass
            try:
                factor = float(initial_realtime_factor) if initial_realtime_factor is not None else 1.0
                if not math.isfinite(factor):
                    factor = 1.0
                _RUN_STATE["realtime_factor"] = max(0.25, min(16.0, factor))
            except Exception:
                _RUN_STATE["realtime_factor"] = 1.0
        thread = threading.Thread(target=_run_streamed, args=(run_id,), daemon=True)
        thread.start()
        return {"status": "started", "run_id": run_id}

    result = simulate_match(
        home_players,
        away_players,
        seed=seed,
        ruleset=ruleset,
        tactics_home=tactics_home,
        tactics_away=tactics_away,
        playbook_home=playbook_home,
        playbook_away=playbook_away,
        rotation_home=rotation_home,
        rotation_away=rotation_away,
        event_callback=None,
        period_count=int(period_count) if period_count else None,
        period_seconds=int(period_seconds) if period_seconds else None,
        ot_seconds=int(ot_seconds) if ot_seconds else None,
        tick_ms=tick_ms,
    )

    if state and max_quarters:
        current_q = int(state.get("current_quarter") or 0)
        current_q = max(0, min(3, current_q))
        next_q = current_q + 1

        def _merge_team_stats(base: Dict[str, int], add: Dict[str, int]) -> Dict[str, int]:
            merged = dict(base or {})
            for key, val in (add or {}).items():
                merged[key] = int(merged.get(key, 0)) + int(val or 0)
            return merged

        def _merge_player_stats(base: list[Dict], add: list[Dict]) -> list[Dict]:
            base_map = {p["player_id"]: dict(p) for p in (base or [])}
            for row in add or []:
                pid = row["player_id"]
                if pid not in base_map:
                    base_map[pid] = dict(row)
                    continue
                for key, val in row.items():
                    if key in {"player_id", "name"}:
                        continue
                    if isinstance(val, (int, float)):
                        base_map[pid][key] = (base_map[pid].get(key, 0) or 0) + val
            return list(base_map.values())

        merged = {
            "ruleset": result.get("ruleset"),
            "possessions": int(state.get("possessions") or 0) + int(result.get("possessions") or 0),
            "score": {
                "home": int(state.get("score", {}).get("home") or 0) + int(result.get("score", {}).get("home") or 0),
                "away": int(state.get("score", {}).get("away") or 0) + int(result.get("score", {}).get("away") or 0),
            },
            "team_stats": {
                "home": _merge_team_stats(state.get("team_stats", {}).get("home"), result.get("team_stats", {}).get("home")),
                "away": _merge_team_stats(state.get("team_stats", {}).get("away"), result.get("team_stats", {}).get("away")),
            },
            "player_stats": {
                "home": _merge_player_stats(state.get("player_stats", {}).get("home"), result.get("player_stats", {}).get("home")),
                "away": _merge_player_stats(state.get("player_stats", {}).get("away"), result.get("player_stats", {}).get("away")),
            },
            "play_by_play": (state.get("play_by_play") or []) + (result.get("play_by_play") or []),
            "lineups": result.get("lineups") or state.get("lineups"),
            "score_by_period": state.get("score_by_period") or {"home": [], "away": []},
            "score_by_quarter": state.get("score_by_quarter"),
            "team_totals": result.get("team_totals"),
            "period_count": result.get("period_count"),
            "period_seconds": result.get("period_seconds"),
            "ot_seconds": result.get("ot_seconds"),
        }
        if merged["score_by_period"]["home"]:
            merged["score_by_period"]["home"][current_q] = int(result.get("score_by_period", {}).get("home", [0])[0])
            merged["score_by_period"]["away"][current_q] = int(result.get("score_by_period", {}).get("away", [0])[0])
        else:
            merged["score_by_period"] = result.get("score_by_period")

        result = {
            **merged,
            "current_quarter": next_q,
            "finished": next_q >= int(result.get("period_count") or 4),
        }

    if stream:
        emit(
            "match.end",
            {
                "home_team_id": int(home_id),
                "away_team_id": int(away_id),
                "score": result.get("score"),
            },
        )
    result["home_team_id"] = int(home_id)
    result["away_team_id"] = int(away_id)

    finished = True
    if state and max_quarters and not result.get("finished"):
        finished = False

    if apply_post_match and finished and result.get("score"):
        _apply_post_match(
            conn,
            result=result,
            home_id=int(home_id),
            away_id=int(away_id),
            current_date=current_date or date.today(),
            home_team=home_team,
            away_team=away_team,
        )

    if payload.get("save", True):
        if not finished:
            return result
        _persist_match_result(
            conn,
            result,
            int(home_id),
            int(away_id),
            int(fixture_id) if fixture_id else None,
            record_fixture=False,
            meta=fixture_meta,
        )
    if fixture_id and result.get("score"):
        competition_service.record_result(
            conn,
            {
                "fixture_id": fixture_id,
                "home_score": result.get("score", {}).get("home"),
                "away_score": result.get("score", {}).get("away"),
            },
        )
    return result
