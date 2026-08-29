from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List, Optional, Tuple


def _safe_json(raw: str | None) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        obj = json.loads(raw)
        return obj if isinstance(obj, dict) else {}
    except Exception:
        return {}


def _to_int(value: Any) -> int:
    try:
        return int(value)
    except Exception:
        return 0


def _to_float(value: Any) -> float:
    try:
        return float(value)
    except Exception:
        return 0.0


def _calc_efg(fgm: int, fga: int, tpm: int) -> float:
    if fga <= 0:
        return 0.0
    return round(((fgm + 0.5 * tpm) / fga) * 100.0, 1)


def _calc_ts(pts: int, fga: int, fta: int) -> float:
    denom = 2.0 * (float(fga) + 0.44 * float(fta))
    if denom <= 0:
        return 0.0
    return round((float(pts) / denom) * 100.0, 1)


def _find_player_row(stats: Dict[str, Any], player_id: int) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    for side in ("home", "away"):
        items = stats.get(side) or []
        if not isinstance(items, list):
            continue
        for row in items:
            if not isinstance(row, dict):
                continue
            if _to_int(row.get("player_id")) == int(player_id):
                return side, row
    return None, None


def match_log(conn: sqlite3.Connection, payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    payload = payload or {}
    player_id = payload.get("player_id") or payload.get("id")
    if player_id is None:
        return {"ok": False, "error": {"message": "player_id required"}}
    player_id = int(player_id)
    league_id = str(payload.get("league_id") or "").upper().strip() or None
    limit = max(1, min(60, _to_int(payload.get("limit") or 15)))
    scan_limit = max(limit, min(800, _to_int(payload.get("scan_limit") or 240)))

    if league_id:
        cur = conn.execute(
            """
            SELECT id, home_team_id, away_team_id, home_score, away_score, possessions, data_json, created_at
            FROM match
            WHERE UPPER(COALESCE(json_extract(data_json, '$.league_id'), '')) = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (league_id, int(scan_limit)),
        )
    else:
        cur = conn.execute(
            """
            SELECT id, home_team_id, away_team_id, home_score, away_score, possessions, data_json, created_at
            FROM match
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (int(scan_limit),),
        )

    items: List[Dict[str, Any]] = []
    seasons: Dict[str, Dict[str, Any]] = {}

    def _acc(season_key: str, row: Dict[str, Any]) -> None:
        bucket = seasons.get(season_key)
        if not bucket:
            bucket = {
                "season_id": None if season_key == "unknown" else season_key,
                "gp": 0,
                "min": 0,
                "pts": 0,
                "reb": 0,
                "ast": 0,
                "stl": 0,
                "blk": 0,
                "tov": 0,
                "pf": 0,
                "fgm": 0,
                "fga": 0,
                "tpm": 0,
                "tpa": 0,
                "ftm": 0,
                "fta": 0,
            }
            seasons[season_key] = bucket
        bucket["gp"] += 1
        for k in ("min", "pts", "reb", "ast", "stl", "blk", "tov", "pf"):
            bucket[k] += _to_int(row.get(k))
        bucket["fgm"] += _to_int(row.get("fgm"))
        bucket["fga"] += _to_int(row.get("fga"))
        bucket["tpm"] += _to_int(row.get("3pm") or row.get("tpm"))
        bucket["tpa"] += _to_int(row.get("3pa") or row.get("tpa"))
        bucket["ftm"] += _to_int(row.get("ftm"))
        bucket["fta"] += _to_int(row.get("fta"))

    for db_row in cur.fetchall():
        data = _safe_json(db_row["data_json"])
        stats = data.get("player_stats") or {}
        if not isinstance(stats, dict):
            continue
        side, prow = _find_player_row(stats, player_id)
        if not prow:
            continue
        is_home = side == "home"
        home_id = int(db_row["home_team_id"])
        away_id = int(db_row["away_team_id"])
        opponent_id = away_id if is_home else home_id
        team_id = home_id if is_home else away_id
        season_id = data.get("season_id")
        season_key = str(season_id) if season_id is not None else "unknown"
        fixture_date = data.get("fixture_date") or data.get("date") or ""

        fgm = _to_int(prow.get("fgm"))
        fga = _to_int(prow.get("fga"))
        tpm = _to_int(prow.get("3pm") or prow.get("tpm"))
        tpa = _to_int(prow.get("3pa") or prow.get("tpa"))
        ftm = _to_int(prow.get("ftm"))
        fta = _to_int(prow.get("fta"))
        pts = _to_int(prow.get("pts"))
        efg = _to_float(prow.get("efg")) or _calc_efg(fgm, fga, tpm)
        ts = _to_float(prow.get("ts")) or _calc_ts(pts, fga, fta)

        entry = {
            "match_id": int(db_row["id"]),
            "date": fixture_date,
            "created_at": int(db_row["created_at"]),
            "league_id": data.get("league_id") or league_id,
            "season_id": season_id,
            "team_id": team_id,
            "opponent_id": opponent_id,
            "is_home": bool(is_home),
            "score": {"home": int(db_row["home_score"]), "away": int(db_row["away_score"])},
            "result": "W"
            if (is_home and int(db_row["home_score"]) > int(db_row["away_score"]))
            or ((not is_home) and int(db_row["away_score"]) > int(db_row["home_score"]))
            else "L",
            "stats": {
                "min": _to_int(prow.get("min")),
                "pts": pts,
                "reb": _to_int(prow.get("reb")),
                "ast": _to_int(prow.get("ast")),
                "stl": _to_int(prow.get("stl")),
                "blk": _to_int(prow.get("blk")),
                "tov": _to_int(prow.get("tov")),
                "pf": _to_int(prow.get("pf")),
                "fgm": fgm,
                "fga": fga,
                "tpm": tpm,
                "tpa": tpa,
                "ftm": ftm,
                "fta": fta,
                "pm": _to_int(prow.get("pm")),
                "efg": efg,
                "ts": ts,
            },
        }
        items.append(entry)
        _acc(season_key, prow)

    items = items[:limit]
    seasons_list = list(seasons.values())
    # Add derived season rates
    for s in seasons_list:
        gp = max(1, int(s.get("gp") or 1))
        fgm = int(s.get("fgm") or 0)
        fga = int(s.get("fga") or 0)
        tpm = int(s.get("tpm") or 0)
        fta = int(s.get("fta") or 0)
        pts = int(s.get("pts") or 0)
        s["ppg"] = round(pts / gp, 1)
        s["rpg"] = round(int(s.get("reb") or 0) / gp, 1)
        s["apg"] = round(int(s.get("ast") or 0) / gp, 1)
        s["efg"] = _calc_efg(fgm, fga, tpm)
        s["ts"] = _calc_ts(pts, fga, fta)

    seasons_list.sort(key=lambda x: (0 if x.get("season_id") is None else 1, str(x.get("season_id") or "")), reverse=True)

    return {
        "ok": True,
        "player_id": player_id,
        "league_id": league_id,
        "items": items,
        "seasons": seasons_list[:8],
        "scanned": int(scan_limit),
        "found": len(items),
    }

