from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime, timedelta
from typing import Any, Dict, Optional, Tuple

from . import ai_service, analytics_service, competition_service, gm_service, health_service, market_service, rules_service


def _parse_iso(value: str | None) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except Exception:
        return None


def _team_league_id(team_data: Dict[str, Any]) -> str:
    raw = team_data.get("league_id") or team_data.get("league") or team_data.get("leagueId") or ""
    return str(raw or "").upper()


def _season_dates_from_rules(rules: Dict[str, Any]) -> Dict[str, Any]:
    return (
        rules.get("season_dates_2025_26")
        or rules.get("season_dates_2025")
        or rules.get("season_dates")
        or {}
    )


def _default_start_date_for_league(league_id: str) -> str:
    snapshot = rules_service.list_leagues()
    for entry in snapshot.get("leagues") or []:
        if str(entry.get("id") or "").upper() != str(league_id or "").upper():
            continue
        rules_file = str(entry.get("rulesFile") or "")
        rules = rules_service.get_competition_rules(rules_file) if rules_file else {}
        season_dates = _season_dates_from_rules(rules)
        start = (
            season_dates.get("regular_season_start")
            or season_dates.get("liga_regular_start")
            or season_dates.get("liga_endesa_start")
            or season_dates.get("season_start")
        )
        start_date = _parse_iso(str(start or ""))
        if start_date:
            return start_date.isoformat()
    return "2025-09-01"


def _get_team(conn: sqlite3.Connection, team_id: int) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    row = conn.execute("SELECT id, name, data_json FROM team WHERE id = ?", (int(team_id),)).fetchone()
    if not row:
        raise ValueError("Team not found")
    team_data = json.loads(row["data_json"]) if row["data_json"] else {}
    return {"id": int(row["id"]), "name": row["name"]}, team_data


def _fixtures_for_team_on_date(conn: sqlite3.Connection, team_id: int, day: str) -> list[dict]:
    rows = conn.execute(
        "SELECT id, competition_id, season_id, home_team_id, away_team_id, date, status, home_score, away_score "
        "FROM fixture WHERE date = ? AND (home_team_id = ? OR away_team_id = ?)",
        (str(day), int(team_id), int(team_id)),
    ).fetchall()
    out = []
    for row in rows:
        out.append(
            {
                "fixture_id": int(row["id"]),
                "season_id": int(row["season_id"]),
                "competition_id": int(row["competition_id"]),
                "home_team_id": int(row["home_team_id"]),
                "away_team_id": int(row["away_team_id"]),
                "date": row["date"],
                "status": row["status"],
                "home_score": row["home_score"],
                "away_score": row["away_score"],
            }
        )
    return out


def _count_market_resolutions(before: list[dict], after: list[dict]) -> int:
    before_map: Dict[str, str] = {}
    for neg in before or []:
        key = str(neg.get("id") or neg.get("negotiation_id") or f"{neg.get('player_id')}:{neg.get('type')}")
        before_map[key] = str(neg.get("status") or "")
    resolved = 0
    for neg in after or []:
        key = str(neg.get("id") or neg.get("negotiation_id") or f"{neg.get('player_id')}:{neg.get('type')}")
        prev = before_map.get(key)
        cur = str(neg.get("status") or "")
        if not prev or prev == cur:
            continue
        if prev in {"pending", "negotiating_wage"} and cur in {"club_accepted", "player_rejected", "agreed", "rejected"}:
            resolved += 1
    return resolved


def prepare_day(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    team_id = payload.get("team_id")
    if not team_id:
        return {"ok": False, "error": {"message": "team_id required"}}
    try:
        team_id = int(team_id)
    except (TypeError, ValueError):
        return {"ok": False, "error": {"message": "team_id must be int"}}

    competition_service.ensure_competitions(conn)

    _team_meta, team_data = _get_team(conn, team_id)
    league_id = _team_league_id(team_data) or "ACB"

    day = str(payload.get("date") or team_data.get("current_date") or "").strip()
    if not day:
        day = _default_start_date_for_league(league_id)

    parsed = _parse_iso(day)
    if not parsed:
        return {"ok": False, "error": {"message": "Invalid date; expected YYYY-MM-DD"}}

    training = payload.get("training") if isinstance(payload.get("training"), dict) else {}
    session_count = int(training.get("session_count") or training.get("sessions") or 1)
    load_score = float(training.get("load") or 45)
    max_rpe = float(training.get("max_rpe") or 7)
    rest_day = bool(training.get("rest_day")) or session_count <= 0
    if rest_day:
        session_count = 0

    training_res = health_service.apply_training_day(
        conn,
        {
            "team_id": team_id,
            "date": day,
            "load": 0 if rest_day else load_score,
            "session_count": session_count,
            "max_rpe": 0 if rest_day else max_rpe,
            "rest_day": rest_day,
        },
    )

    market_res = market_service.simulate_day(conn, {"current_date": day})

    ai_payload = payload.get("ai") if isinstance(payload.get("ai"), dict) else {}
    league_ids = ai_payload.get("league_ids")
    if not isinstance(league_ids, list) or not league_ids:
        league_ids = [league_id]
    ai_res = ai_service.advance_day(
        conn,
        {
            "current_date": day,
            "human_team_id": team_id,
            "league_ids": league_ids,
        },
    )

    return {
        "ok": True,
        "date": day,
        "league_id": league_id,
        "training": training_res,
        "market": market_res,
        "ai": ai_res,
    }


def finalize_day(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    team_id = payload.get("team_id")
    if not team_id:
        return {"ok": False, "error": {"message": "team_id required"}}
    try:
        team_id = int(team_id)
    except (TypeError, ValueError):
        return {"ok": False, "error": {"message": "team_id must be int"}}

    _team_meta, team_data = _get_team(conn, team_id)
    league_id = _team_league_id(team_data) or "ACB"

    day = str(payload.get("date") or team_data.get("current_date") or "").strip()
    if not day:
        day = _default_start_date_for_league(league_id)
    parsed = _parse_iso(day)
    if not parsed:
        return {"ok": False, "error": {"message": "Invalid date; expected YYYY-MM-DD"}}

    summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
    gm_res = gm_service.advance_day(
        conn,
        {
            "team_id": team_id,
            "date": day,
            "summary": summary,
            "team_state": payload.get("team_state") if isinstance(payload.get("team_state"), dict) else {},
        },
    )

    gm_snapshot = gm_service.snapshot(conn, {"team_id": team_id}).get("snapshot")
    competition_snapshot = competition_service.snapshot(conn, {"league_id": league_id, "ensure": True}).get("snapshot")
    analytics_snapshot = analytics_service.snapshot(conn, {"team_id": team_id, "league_id": league_id}).get("snapshot")

    next_date = None
    if gm_snapshot and isinstance(gm_snapshot, dict):
        next_date = (gm_snapshot.get("state") or {}).get("current_date")
    if not next_date:
        next_date = (parsed + timedelta(days=1)).isoformat()

    return {
        "ok": True,
        "date": day,
        "next_date": next_date,
        "gm": {"advance": gm_res, "snapshot": gm_snapshot},
        "competition": competition_snapshot,
        "analytics": analytics_snapshot,
    }


def advance_day(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    team_id = payload.get("team_id")
    if not team_id:
        return {"ok": False, "error": {"message": "team_id required"}}
    try:
        team_id_int = int(team_id)
    except (TypeError, ValueError):
        return {"ok": False, "error": {"message": "team_id must be int"}}

    prepared = prepare_day(conn, payload)
    if not prepared.get("ok"):
        return prepared

    day = str(prepared.get("date") or "")
    league_id = str(prepared.get("league_id") or "")

    match_summary: Dict[str, Any] = {}
    simulated_human = 0
    if bool(payload.get("auto_simulate_human_fixtures")):
        from . import match_service

        fixtures = _fixtures_for_team_on_date(conn, team_id_int, day)
        for fixture in fixtures:
            if fixture.get("home_score") is not None and fixture.get("away_score") is not None:
                continue
            try:
                res = match_service.simulate(
                    conn,
                    {
                        "home_team_id": int(fixture["home_team_id"]),
                        "away_team_id": int(fixture["away_team_id"]),
                        "fixture_id": int(fixture["fixture_id"]),
                        "stream": False,
                        "apply_post_match": True,
                        "current_date": day,
                    },
                )
            except Exception:
                continue
            if isinstance(res, dict) and res.get("score"):
                match_summary = {
                    "fixtureId": int(fixture["fixture_id"]),
                    "date": day,
                    "homeId": int(fixture["home_team_id"]),
                    "awayId": int(fixture["away_team_id"]),
                    "homeScore": int(res.get("score", {}).get("home") or 0),
                    "awayScore": int(res.get("score", {}).get("away") or 0),
                }
                simulated_human += 1

    training_res = prepared.get("training") if isinstance(prepared.get("training"), dict) else {}
    training_payload = payload.get("training") if isinstance(payload.get("training"), dict) else {}
    sessions = int(training_payload.get("session_count") or training_payload.get("sessions") or 1)
    rest_day = bool(training_payload.get("rest_day")) or sessions <= 0
    if rest_day:
        sessions = 0
    load_score = float(training_payload.get("load") or 45)

    market_res = prepared.get("market") if isinstance(prepared.get("market"), dict) else {}
    ai_res = prepared.get("ai") if isinstance(prepared.get("ai"), dict) else {}

    daily_summary = {
        "training": {
            "sessions": int(sessions),
            "load": 0 if rest_day else float(load_score),
            "injuries": len(training_res.get("injuries") or []) if isinstance(training_res, dict) else 0,
        },
        "market": {"resolved": int(market_res.get("resolved") or 0)},
        "match": match_summary or {},
        "ai": {
            "updated": int(ai_res.get("updated") or 0),
            "offers": int(ai_res.get("offers") or 0),
            "simulated_matches": int(ai_res.get("simulated_matches") or 0),
        },
    }

    finalized = finalize_day(
        conn,
        {
            "team_id": team_id_int,
            "date": day,
            "summary": daily_summary,
            "team_state": payload.get("team_state") if isinstance(payload.get("team_state"), dict) else {},
        },
    )
    if not finalized.get("ok"):
        return finalized

    return {
        "ok": True,
        "date": day,
        "league_id": league_id,
        "next_date": finalized.get("next_date"),
        "summary": daily_summary,
        "prepared": prepared,
        "finalized": finalized,
        "gm": finalized.get("gm"),
        "competition": finalized.get("competition"),
        "analytics": finalized.get("analytics"),
        "simulated_human_fixtures": simulated_human,
    }
