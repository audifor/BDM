from __future__ import annotations

import json
import sqlite3
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from . import competition_service


def _safe_json(raw: str | None) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        return {}


def _current_season(conn: sqlite3.Connection) -> Tuple[Optional[int], str, Optional[int]]:
    row = conn.execute("SELECT current_season_id FROM savegame ORDER BY id LIMIT 1").fetchone()
    if not row or not row["current_season_id"]:
        return None, "", None
    season_id = int(row["current_season_id"])
    row = conn.execute("SELECT id, year, name FROM season WHERE id = ?", (season_id,)).fetchone()
    if not row:
        return season_id, "", None
    season_year = int(row["year"]) if row["year"] is not None else None
    season_label = row["name"] or str(season_year or season_id)
    return season_id, season_label, season_year


def _fixture_meta_map(conn: sqlite3.Connection) -> Dict[int, Dict[str, Any]]:
    rows = conn.execute(
        "SELECT f.id, f.date, f.season_id, f.competition_id, c.league_id "
        "FROM fixture f JOIN competition c ON c.id = f.competition_id"
    ).fetchall()
    meta: Dict[int, Dict[str, Any]] = {}
    for row in rows:
        fid = int(row["id"])
        meta[fid] = {
            "fixture_id": fid,
            "fixture_date": row["date"],
            "season_id": int(row["season_id"]) if row["season_id"] is not None else None,
            "competition_id": int(row["competition_id"]) if row["competition_id"] is not None else None,
            "league_id": row["league_id"],
        }
    return meta


def _load_team_map(conn: sqlite3.Connection) -> Dict[int, Dict[str, Any]]:
    rows = conn.execute("SELECT id, name, data_json FROM team").fetchall()
    team_map: Dict[int, Dict[str, Any]] = {}
    for row in rows:
        data = _safe_json(row["data_json"])
        league_id = str(data.get("league_id") or data.get("league") or data.get("leagueId") or "").upper()
        team_map[int(row["id"])] = {
            "id": int(row["id"]),
            "name": row["name"],
            "data": data,
            "league_id": league_id,
        }
    return team_map


def _load_player_map(conn: sqlite3.Connection) -> Dict[int, Dict[str, Any]]:
    rows = conn.execute("SELECT id, name, data_json FROM player").fetchall()
    player_map: Dict[int, Dict[str, Any]] = {}
    for row in rows:
        data = _safe_json(row["data_json"])
        player_map[int(row["id"])] = {
            "id": int(row["id"]),
            "name": row["name"],
            "data": data,
        }
    return player_map


def _date_to_ts(value: str | None) -> int:
    if not value:
        return int(time.time())
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d")
        return int(parsed.timestamp())
    except Exception:
        return int(time.time())


def _merge_match_meta(
    match_data: Dict[str, Any],
    fixture_meta_map: Dict[int, Dict[str, Any]],
    team_map: Dict[int, Dict[str, Any]],
    home_id: int,
    away_id: int,
) -> Dict[str, Any]:
    meta = {
        "league_id": match_data.get("league_id"),
        "season_id": match_data.get("season_id"),
        "competition_id": match_data.get("competition_id"),
        "fixture_id": match_data.get("fixture_id"),
        "fixture_date": match_data.get("fixture_date"),
    }
    fixture_id = match_data.get("fixture_id")
    if fixture_id and int(fixture_id) in fixture_meta_map:
        fixture_meta = fixture_meta_map[int(fixture_id)]
        for key, value in fixture_meta.items():
            if meta.get(key) is None and value is not None:
                meta[key] = value
    if not meta.get("league_id"):
        meta["league_id"] = team_map.get(home_id, {}).get("league_id") or team_map.get(away_id, {}).get("league_id")
    if meta.get("league_id"):
        meta["league_id"] = str(meta["league_id"]).upper()
    return meta


def _iter_matches(
    conn: sqlite3.Connection,
    league_id: Optional[str] = None,
    season_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    league_key = str(league_id or "").upper() if league_id else ""
    fixture_meta_map = _fixture_meta_map(conn)
    team_map = _load_team_map(conn)
    rows = conn.execute(
        "SELECT id, home_team_id, away_team_id, home_score, away_score, possessions, data_json, created_at "
        "FROM match"
    ).fetchall()
    matches: List[Dict[str, Any]] = []
    for row in rows:
        data = _safe_json(row["data_json"])
        home_id = int(row["home_team_id"])
        away_id = int(row["away_team_id"])
        meta = _merge_match_meta(data, fixture_meta_map, team_map, home_id, away_id)
        if league_key and str(meta.get("league_id") or "").upper() != league_key:
            continue
        if season_id and meta.get("season_id") and int(meta.get("season_id")) != int(season_id):
            continue
        matches.append(
            {
                "id": int(row["id"]),
                "home_team_id": home_id,
                "away_team_id": away_id,
                "home_score": int(row["home_score"] or 0),
                "away_score": int(row["away_score"] or 0),
                "possessions": int(row["possessions"] or 0),
                "data": data,
                "created_at": int(row["created_at"] or 0),
                "meta": meta,
            }
        )
    return matches


def _totals_from_players(players: List[Dict[str, Any]]) -> Dict[str, int]:
    totals = {"fgm": 0, "fga": 0, "3pm": 0, "3pa": 0, "ftm": 0, "fta": 0}
    for row in players:
        totals["fgm"] += int(row.get("fgm") or 0)
        totals["fga"] += int(row.get("fga") or 0)
        totals["3pm"] += int(row.get("3pm") or 0)
        totals["3pa"] += int(row.get("3pa") or 0)
        totals["ftm"] += int(row.get("ftm") or 0)
        totals["fta"] += int(row.get("fta") or 0)
    return totals


def _team_stats_from_players(players: List[Dict[str, Any]]) -> Dict[str, int]:
    return {
        "reb": sum(int(row.get("reb") or 0) for row in players),
        "ast": sum(int(row.get("ast") or 0) for row in players),
        "tov": sum(int(row.get("tov") or 0) for row in players),
        "stl": sum(int(row.get("stl") or 0) for row in players),
        "blk": sum(int(row.get("blk") or 0) for row in players),
    }


def _blank_team_row() -> Dict[str, float]:
    return {
        "games": 0,
        "wins": 0,
        "losses": 0,
        "pts_for": 0,
        "pts_against": 0,
        "possessions": 0,
        "fgm": 0,
        "fga": 0,
        "3pm": 0,
        "3pa": 0,
        "ftm": 0,
        "fta": 0,
        "reb": 0,
        "ast": 0,
        "tov": 0,
    }


def _aggregate_team_stats(matches: List[Dict[str, Any]]) -> Dict[int, Dict[str, float]]:
    stats: Dict[int, Dict[str, float]] = {}
    for match in matches:
        home_id = int(match["home_team_id"])
        away_id = int(match["away_team_id"])
        home = stats.setdefault(home_id, _blank_team_row())
        away = stats.setdefault(away_id, _blank_team_row())

        home_score = int(match["home_score"] or 0)
        away_score = int(match["away_score"] or 0)
        possessions = int(match["possessions"] or 0)

        data = match.get("data") or {}
        totals = data.get("team_totals") or {}
        team_stats = data.get("team_stats") or {}
        players = data.get("player_stats") or {}

        home_totals = totals.get("home") or _totals_from_players(players.get("home") or [])
        away_totals = totals.get("away") or _totals_from_players(players.get("away") or [])
        home_stats = team_stats.get("home") or _team_stats_from_players(players.get("home") or [])
        away_stats = team_stats.get("away") or _team_stats_from_players(players.get("away") or [])

        home["games"] += 1
        away["games"] += 1

        if home_score > away_score:
            home["wins"] += 1
            away["losses"] += 1
        else:
            away["wins"] += 1
            home["losses"] += 1

        home["pts_for"] += home_score
        home["pts_against"] += away_score
        away["pts_for"] += away_score
        away["pts_against"] += home_score

        home["possessions"] += possessions
        away["possessions"] += possessions

        for key in ("fgm", "fga", "3pm", "3pa", "ftm", "fta"):
            home[key] += int(home_totals.get(key) or 0)
            away[key] += int(away_totals.get(key) or 0)

        for key in ("reb", "ast", "tov"):
            home[key] += int(home_stats.get(key) or 0)
            away[key] += int(away_stats.get(key) or 0)

    return stats


def _compute_team_metrics(stats: Dict[str, float]) -> Dict[str, float]:
    games = max(1, int(stats.get("games") or 0))
    possessions = float(stats.get("possessions") or 0)
    fga = float(stats.get("fga") or 0)
    fta = float(stats.get("fta") or 0)
    fgm = float(stats.get("fgm") or 0)
    tpm = float(stats.get("3pm") or 0)
    pts_for = float(stats.get("pts_for") or 0)
    pts_against = float(stats.get("pts_against") or 0)

    pace = possessions / games if games else 0.0
    off_rating = (pts_for / possessions * 100) if possessions else 0.0
    def_rating = (pts_against / possessions * 100) if possessions else 0.0
    net_rating = off_rating - def_rating

    efg_pct = ((fgm + 0.5 * tpm) / fga * 100) if fga else 0.0
    ts_pct = (pts_for / (2 * (fga + 0.44 * fta)) * 100) if (fga + fta) else 0.0

    return {
        "games": int(stats.get("games") or 0),
        "wins": int(stats.get("wins") or 0),
        "losses": int(stats.get("losses") or 0),
        "pace": round(pace, 2),
        "off_rating": round(off_rating, 2),
        "def_rating": round(def_rating, 2),
        "net_rating": round(net_rating, 2),
        "efg_pct": round(efg_pct, 2),
        "ts_pct": round(ts_pct, 2),
        "ast_pg": round(float(stats.get("ast") or 0) / games, 2),
        "reb_pg": round(float(stats.get("reb") or 0) / games, 2),
        "tov_pg": round(float(stats.get("tov") or 0) / games, 2),
        "ft_rate": round((fta / fga) if fga else 0.0, 3),
        "tp_rate": round((float(stats.get("3pa") or 0) / fga) if fga else 0.0, 3),
        "pts_for": int(stats.get("pts_for") or 0),
        "pts_against": int(stats.get("pts_against") or 0),
    }


def _blank_player_row() -> Dict[str, float]:
    return {
        "games": 0,
        "min": 0,
        "pts": 0,
        "reb": 0,
        "ast": 0,
        "stl": 0,
        "blk": 0,
        "tov": 0,
        "fgm": 0,
        "fga": 0,
        "3pm": 0,
        "3pa": 0,
        "ftm": 0,
        "fta": 0,
        "team_id": None,
    }


def _aggregate_player_stats(matches: List[Dict[str, Any]]) -> Dict[int, Dict[str, float]]:
    stats: Dict[int, Dict[str, float]] = {}
    for match in matches:
        data = match.get("data") or {}
        player_stats = data.get("player_stats") or {}
        for side in ("home", "away"):
            players = player_stats.get(side) or []
            team_id = int(match["home_team_id"] if side == "home" else match["away_team_id"])
            for row in players:
                player_id = row.get("player_id")
                if player_id is None:
                    continue
                pid = int(player_id)
                entry = stats.setdefault(pid, _blank_player_row())
                minutes = int(row.get("min") or 0)
                if minutes > 0:
                    entry["games"] += 1
                entry["min"] += minutes
                for key in ("pts", "reb", "ast", "stl", "blk", "tov", "fgm", "fga", "3pm", "3pa", "ftm", "fta"):
                    entry[key] += int(row.get(key) or 0)
                entry["team_id"] = team_id
    return stats


def _compute_player_metrics(stats: Dict[str, float]) -> Dict[str, float]:
    games = max(1, int(stats.get("games") or 0))
    fga = float(stats.get("fga") or 0)
    fta = float(stats.get("fta") or 0)
    fgm = float(stats.get("fgm") or 0)
    tpm = float(stats.get("3pm") or 0)
    pts = float(stats.get("pts") or 0)

    ppg = pts / games
    rpg = float(stats.get("reb") or 0) / games
    apg = float(stats.get("ast") or 0) / games
    spg = float(stats.get("stl") or 0) / games
    bpg = float(stats.get("blk") or 0) / games
    tov_pg = float(stats.get("tov") or 0) / games
    mpg = float(stats.get("min") or 0) / games

    efg_pct = ((fgm + 0.5 * tpm) / fga * 100) if fga else 0.0
    ts_pct = (pts / (2 * (fga + 0.44 * fta)) * 100) if (fga + fta) else 0.0

    impact = ppg + 1.2 * rpg + 1.4 * apg + 1.6 * spg + 1.6 * bpg - 1.3 * tov_pg
    def_score = spg * 1.8 + bpg * 1.8 + rpg * 0.4

    return {
        "games": int(stats.get("games") or 0),
        "min": int(stats.get("min") or 0),
        "ppg": round(ppg, 2),
        "rpg": round(rpg, 2),
        "apg": round(apg, 2),
        "spg": round(spg, 2),
        "bpg": round(bpg, 2),
        "tov_pg": round(tov_pg, 2),
        "mpg": round(mpg, 2),
        "efg_pct": round(efg_pct, 2),
        "ts_pct": round(ts_pct, 2),
        "impact": round(impact, 2),
        "def_score": round(def_score, 2),
        "team_id": stats.get("team_id"),
        "pts": int(stats.get("pts") or 0),
        "reb": int(stats.get("reb") or 0),
        "ast": int(stats.get("ast") or 0),
    }


def _build_leaders(
    player_metrics: Dict[int, Dict[str, float]],
    player_map: Dict[int, Dict[str, Any]],
    team_map: Dict[int, Dict[str, Any]],
) -> Dict[str, List[Dict[str, Any]]]:
    def _top(metric: str, limit: int = 8) -> List[Dict[str, Any]]:
        items = sorted(
            player_metrics.items(),
            key=lambda item: float(item[1].get(metric) or 0),
            reverse=True,
        )[:limit]
        leaders = []
        for pid, metrics in items:
            player = player_map.get(pid, {})
            team_id = metrics.get("team_id")
            leaders.append(
                {
                    "player_id": pid,
                    "name": player.get("name") or "Jugador",
                    "team_id": team_id,
                    "team_name": team_map.get(team_id, {}).get("name") or "--",
                    "value": metrics.get(metric),
                }
            )
        return leaders

    return {
        "points": _top("ppg"),
        "rebounds": _top("rpg"),
        "assists": _top("apg"),
        "impact": _top("impact"),
    }


def _rank_metrics(team_metrics: Dict[int, Dict[str, float]]) -> Dict[int, Dict[str, int]]:
    rank_defs = {
        "off_rating": "desc",
        "def_rating": "asc",
        "net_rating": "desc",
        "efg_pct": "desc",
        "ts_pct": "desc",
        "ast_pg": "desc",
        "reb_pg": "desc",
        "tov_pg": "asc",
        "pace": "desc",
    }
    ranks: Dict[int, Dict[str, int]] = {tid: {} for tid in team_metrics.keys()}
    for metric, order in rank_defs.items():
        reverse = order == "desc"
        ordered = sorted(
            team_metrics.items(),
            key=lambda item: float(item[1].get(metric) or 0),
            reverse=reverse,
        )
        for idx, (team_id, _metrics) in enumerate(ordered, start=1):
            ranks.setdefault(team_id, {})[metric] = idx
    return ranks


def _league_averages(team_stats: Dict[int, Dict[str, float]]) -> Dict[str, float]:
    totals = _blank_team_row()
    for row in team_stats.values():
        for key in totals.keys():
            totals[key] += float(row.get(key) or 0)
    return _compute_team_metrics(totals)


def _eligible_players(player_metrics: Dict[int, Dict[str, float]], min_games: int) -> List[Tuple[int, Dict[str, float]]]:
    return [(pid, metrics) for pid, metrics in player_metrics.items() if int(metrics.get("games") or 0) >= min_games]


def _select_awards(
    player_metrics: Dict[int, Dict[str, float]],
    player_map: Dict[int, Dict[str, Any]],
    team_map: Dict[int, Dict[str, Any]],
    team_metrics: Dict[int, Dict[str, float]],
    season_id: Optional[int],
    league_id: str,
) -> List[Dict[str, Any]]:
    if not player_metrics:
        return []

    max_games = max(int(m.get("games") or 0) for m in player_metrics.values())
    min_games = max(8, int(max_games * 0.4))
    eligible = _eligible_players(player_metrics, min_games)

    def _winner(items: List[Tuple[int, Dict[str, float]]], key: str) -> Optional[int]:
        if not items:
            return None
        return sorted(items, key=lambda item: float(item[1].get(key) or 0), reverse=True)[0][0]

    mvp_id = _winner(eligible, "impact")
    dpoy_id = _winner(eligible, "def_score")

    rookies = []
    for pid, metrics in eligible:
        pdata = player_map.get(pid, {}).get("data") or {}
        age = pdata.get("bio", {}).get("age")
        try:
            age_val = int(age) if age is not None else None
        except (TypeError, ValueError):
            age_val = None
        if age_val is not None and age_val <= 21:
            rookies.append((pid, metrics))
    roy_id = _winner(rookies, "impact")

    starters_by_team: Dict[int, set[int]] = {}
    for team_id in team_metrics.keys():
        team_players = [(pid, metrics) for pid, metrics in player_metrics.items() if metrics.get("team_id") == team_id]
        team_players = sorted(team_players, key=lambda item: float(item[1].get("mpg") or 0), reverse=True)[:5]
        starters_by_team[team_id] = {pid for pid, _metrics in team_players}
    sixth_candidates = [
        (pid, metrics)
        for pid, metrics in eligible
        if metrics.get("mpg", 0) >= 15
        and pid not in starters_by_team.get(metrics.get("team_id"), set())
    ]
    sixth_id = _winner(sixth_candidates, "impact")

    mip_candidates: List[Tuple[int, Dict[str, float], float]] = []
    for pid, metrics in eligible:
        pdata = player_map.get(pid, {}).get("data") or {}
        history = pdata.get("season_stats_history")
        if not isinstance(history, list) or not history:
            continue
        prev = history[-1]
        try:
            prev_impact = float(prev.get("impact") or 0)
        except (TypeError, ValueError):
            prev_impact = 0.0
        delta = float(metrics.get("impact") or 0) - prev_impact
        if delta > 0:
            mip_candidates.append((pid, metrics, delta))
    mip_id = None
    if mip_candidates:
        mip_id = sorted(mip_candidates, key=lambda item: item[2], reverse=True)[0][0]

    scoring_id = _winner(eligible, "ppg")
    assist_id = _winner(eligible, "apg")
    rebound_id = _winner(eligible, "rpg")

    awards: List[Dict[str, Any]] = []

    def _add_award(code: str, name: str, winner_id: Optional[int], stat_key: str | None = None) -> None:
        if not winner_id:
            return
        metrics = player_metrics.get(winner_id) or {}
        awards.append(
            {
                "id": code,
                "name": name,
                "winner_id": winner_id,
                "winner_name": player_map.get(winner_id, {}).get("name") or "Jugador",
                "team_id": metrics.get("team_id"),
                "team_name": team_map.get(metrics.get("team_id"), {}).get("name") or "--",
                "value": metrics.get(stat_key) if stat_key else None,
                "stat": stat_key,
                "season_id": season_id,
                "league_id": league_id,
            }
        )

    _add_award("mvp", "MVP", mvp_id, "impact")
    _add_award("dpoy", "Defensive Player", dpoy_id, "def_score")
    _add_award("roy", "Rookie of the Year", roy_id, "impact")
    _add_award("sixth", "Sixth Man", sixth_id, "impact")
    _add_award("mip", "Most Improved", mip_id, "impact")
    _add_award("scoring", "Scoring Leader", scoring_id, "ppg")
    _add_award("assists", "Assist Leader", assist_id, "apg")
    _add_award("rebounds", "Rebound Leader", rebound_id, "rpg")

    return awards


def snapshot(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    team_id = payload.get("team_id")
    league_id = payload.get("league_id")
    team_map = _load_team_map(conn)
    if team_id and not league_id:
        league_id = team_map.get(int(team_id), {}).get("league_id")
    league_id = str(league_id or "").upper()
    if not league_id:
        return {"ok": False, "error": {"message": "league_id required"}}

    season_id, season_label, season_year = _current_season(conn)
    matches = _iter_matches(conn, league_id=league_id, season_id=season_id)
    team_stats = _aggregate_team_stats(matches)
    team_metrics = {tid: _compute_team_metrics(stats) for tid, stats in team_stats.items()}
    league_avg = _league_averages(team_stats) if team_stats else {}
    team_ranks = _rank_metrics(team_metrics) if team_metrics else {}

    player_stats = _aggregate_player_stats(matches)
    player_metrics = {pid: _compute_player_metrics(stats) for pid, stats in player_stats.items()}
    player_map = _load_player_map(conn)
    leaders = _build_leaders(player_metrics, player_map, team_map) if player_metrics else {}

    comp_row = conn.execute(
        "SELECT id, name, data_json FROM competition WHERE league_id = ? ORDER BY id LIMIT 1",
        (league_id,),
    ).fetchone()
    comp_data = _safe_json(comp_row["data_json"]) if comp_row else {}
    awards = []
    if season_id and isinstance(comp_data.get("awards_history"), dict):
        awards = comp_data.get("awards_history", {}).get(str(season_id), [])
    if not awards:
        awards = comp_data.get("last_awards") or _select_awards(
            player_metrics, player_map, team_map, team_metrics, season_id, league_id
        )

    team_metrics_payload = team_metrics.get(int(team_id)) if team_id else None
    team_ranks_payload = team_ranks.get(int(team_id)) if team_id else None

    return {
        "ok": True,
        "snapshot": {
            "team_id": int(team_id) if team_id else None,
            "league_id": league_id,
            "league_name": comp_row["name"] if comp_row else league_id,
            "season_id": season_id,
            "season_label": season_label,
            "season_year": season_year,
            "team_metrics": team_metrics_payload,
            "team_ranks": team_ranks_payload,
            "league_averages": league_avg,
            "leaders": leaders,
            "awards": awards,
            "updated_at": int(time.time()),
        },
    }


def _update_record(
    records: Dict[str, Any],
    key: str,
    value: float,
    label: str,
    holder: str,
    date_value: int,
    higher_is_better: bool = True,
) -> None:
    current = records.get(key) or {}
    current_value = current.get("value")
    try:
        current_value = float(current_value)
    except (TypeError, ValueError):
        current_value = None
    if current_value is None:
        update = True
    else:
        update = value > current_value if higher_is_better else value < current_value
    if update:
        records[key] = {"label": label, "value": value, "holder": holder, "date": date_value}


def _team_match_records(
    matches: List[Dict[str, Any]],
    team_id: int,
    team_map: Dict[int, Dict[str, Any]],
    player_map: Dict[int, Dict[str, Any]],
) -> Dict[str, Any]:
    best_margin = None
    best_points = None
    best_player_points = None
    records: Dict[str, Any] = {}

    for match in matches:
        home_id = int(match["home_team_id"])
        away_id = int(match["away_team_id"])
        if team_id not in (home_id, away_id):
            continue
        is_home = team_id == home_id
        pts_for = int(match["home_score"] if is_home else match["away_score"])
        pts_against = int(match["away_score"] if is_home else match["home_score"])
        margin = pts_for - pts_against
        fixture_date = (match.get("meta") or {}).get("fixture_date")
        date_value = _date_to_ts(fixture_date)

        if best_points is None or pts_for > best_points[0]:
            best_points = (pts_for, date_value, match)
        if best_margin is None or margin > best_margin[0]:
            best_margin = (margin, date_value, match)

        player_stats = (match.get("data") or {}).get("player_stats") or {}
        players = player_stats.get("home" if is_home else "away") or []
        for row in players:
            pts = int(row.get("pts") or 0)
            if best_player_points is None or pts > best_player_points[0]:
                best_player_points = (pts, date_value, row)

    if best_points:
        records["match_most_points"] = {
            "label": "Mas puntos en un partido",
            "value": best_points[0],
            "holder": team_map.get(team_id, {}).get("name") or "--",
            "date": best_points[1],
        }
    if best_margin:
        records["match_biggest_win"] = {
            "label": "Mayor victoria",
            "value": best_margin[0],
            "holder": team_map.get(team_id, {}).get("name") or "--",
            "date": best_margin[1],
        }
    if best_player_points:
        player_name = player_map.get(int(best_player_points[2].get("player_id") or 0), {}).get("name") or "Jugador"
        records["player_most_points"] = {
            "label": "Mas puntos (jugador)",
            "value": best_player_points[0],
            "holder": player_name,
            "date": best_player_points[1],
        }
    return records


def finalize_league_season(
    conn: sqlite3.Connection,
    league_id: str,
    season_end_date: Optional[str] = None,
) -> Dict[str, Any]:
    league_id = str(league_id or "").upper()
    if not league_id:
        return {"ok": False, "error": {"message": "league_id required"}}

    season_id, season_label, season_year = _current_season(conn)
    comp_row = conn.execute(
        "SELECT id, name, data_json FROM competition WHERE league_id = ? ORDER BY id LIMIT 1",
        (league_id,),
    ).fetchone()
    if not comp_row:
        return {"ok": False, "error": {"message": "competition not found"}}

    comp_data = _safe_json(comp_row["data_json"])
    finalized = comp_data.get("season_finalized") if isinstance(comp_data.get("season_finalized"), dict) else {}
    if season_id and finalized.get(str(season_id)):
        return {"ok": True, "already": True}

    matches = _iter_matches(conn, league_id=league_id, season_id=season_id)
    team_stats = _aggregate_team_stats(matches)
    team_metrics = {tid: _compute_team_metrics(stats) for tid, stats in team_stats.items()}
    player_stats = _aggregate_player_stats(matches)
    player_metrics = {pid: _compute_player_metrics(stats) for pid, stats in player_stats.items()}
    team_map = _load_team_map(conn)
    player_map = _load_player_map(conn)

    standings = []
    try:
        snap = competition_service.snapshot(conn, {"league_id": league_id})
        standings = (snap.get("snapshot") or {}).get("standings") or []
    except Exception:
        standings = []
    standings_map = {int(row.get("id") or 0): row for row in standings}

    awards = _select_awards(player_metrics, player_map, team_map, team_metrics, season_id, league_id)

    if season_id:
        comp_data.setdefault("awards_history", {})[str(season_id)] = awards
        comp_data.setdefault("season_finalized", {})[str(season_id)] = True
    comp_data["last_awards"] = awards
    conn.execute(
        "UPDATE competition SET data_json = ?, updated_at = ? WHERE id = ?",
        (json.dumps(comp_data, ensure_ascii=True), int(time.time()), int(comp_row["id"])),
    )
    conn.commit()

    champion_id = int(standings[0]["id"]) if standings else None
    champion_name = team_map.get(champion_id, {}).get("name") if champion_id else "Equipo"

    for team_id, team in team_map.items():
        if team.get("league_id") != league_id:
            continue
        data = team.get("data") or {}
        records = data.get("records") if isinstance(data.get("records"), dict) else {}
        history = data.get("season_history") if isinstance(data.get("season_history"), list) else []
        trophies = data.get("trophies") if isinstance(data.get("trophies"), list) else []
        milestones = data.get("milestones") if isinstance(data.get("milestones"), list) else []

        metrics = team_metrics.get(team_id) or {}
        position = int(standings_map.get(team_id, {}).get("id") or 0)
        if standings:
            for idx, row in enumerate(standings, start=1):
                if int(row.get("id") or 0) == team_id:
                    position = idx
                    break
        season_entry = {
            "season_id": season_id,
            "season_label": season_label,
            "season_year": season_year,
            "league_id": league_id,
            "position": position,
            "wins": metrics.get("wins", 0),
            "losses": metrics.get("losses", 0),
            "pts_for": metrics.get("pts_for", 0),
            "pts_against": metrics.get("pts_against", 0),
            "net_rating": metrics.get("net_rating", 0),
        }
        if season_id and not any(str(item.get("season_id")) == str(season_id) for item in history):
            history.append(season_entry)

        team_record_pct = 0.0
        games = float(metrics.get("wins", 0) + metrics.get("losses", 0))
        if games:
            team_record_pct = float(metrics.get("wins", 0)) / games
        _update_record(
            records,
            "team_best_record",
            round(team_record_pct, 3),
            "Mejor record (pct)",
            team.get("name") or "--",
            int(time.time()),
            higher_is_better=True,
        )

        match_records = _team_match_records(matches, team_id, team_map, player_map)
        for key, entry in match_records.items():
            _update_record(
                records,
                key,
                float(entry.get("value") or 0),
                entry.get("label") or key,
                entry.get("holder") or "--",
                int(entry.get("date") or time.time()),
                higher_is_better=True,
            )

        if champion_id and team_id == champion_id:
            trophy = {
                "name": f"Campeon {comp_row['name']}",
                "category": "league",
                "season": int(season_year or 0),
                "final_score": f"{metrics.get('wins', 0)}-{metrics.get('losses', 0)}",
                "mvp": None,
            }
            trophies.append(trophy)
            milestones.append(
                {
                    "title": f"Titulo {comp_row['name']}",
                    "description": f"{champion_name} gana la liga {comp_row['name']}.",
                    "date": int(time.time()),
                }
            )

        data["records"] = records
        data["season_history"] = history
        data["trophies"] = trophies
        data["milestones"] = milestones
        conn.execute(
            "UPDATE team SET data_json = ?, updated_at = ? WHERE id = ?",
            (json.dumps(data, ensure_ascii=True), int(time.time()), int(team_id)),
        )

    conn.commit()

    awards_by_player: Dict[int, List[Dict[str, Any]]] = {}
    for award in awards:
        winner_id = award.get("winner_id")
        if winner_id:
            awards_by_player.setdefault(int(winner_id), []).append(award)

    for player_id, metrics in player_metrics.items():
        pdata = player_map.get(player_id, {}).get("data") or {}
        history = pdata.get("season_stats_history") if isinstance(pdata.get("season_stats_history"), list) else []
        entry = {
            "season_id": season_id,
            "season_label": season_label,
            "league_id": league_id,
            "team_id": metrics.get("team_id"),
            "games": metrics.get("games"),
            "min": metrics.get("min"),
            "pts": metrics.get("pts"),
            "reb": metrics.get("reb"),
            "ast": metrics.get("ast"),
            "ppg": metrics.get("ppg"),
            "rpg": metrics.get("rpg"),
            "apg": metrics.get("apg"),
            "impact": metrics.get("impact"),
        }
        if season_id and not any(str(item.get("season_id")) == str(season_id) for item in history):
            history.append(entry)
        pdata["season_stats_history"] = history

        player_awards = pdata.get("awards") if isinstance(pdata.get("awards"), list) else []
        for award in awards_by_player.get(player_id, []):
            if any(
                str(item.get("id")) == str(award.get("id"))
                and str(item.get("season_id")) == str(season_id)
                for item in player_awards
            ):
                continue
            player_awards.append(
                {
                    "id": award.get("id"),
                    "name": award.get("name"),
                    "season_id": season_id,
                    "league_id": league_id,
                    "value": award.get("value"),
                }
            )
        pdata["awards"] = player_awards

        conn.execute(
            "UPDATE player SET data_json = ?, updated_at = ? WHERE id = ?",
            (json.dumps(pdata, ensure_ascii=True), int(time.time()), int(player_id)),
        )

    conn.commit()

    return {"ok": True, "awards": awards, "champion": champion_id, "season_id": season_id}
