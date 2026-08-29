from __future__ import annotations

import json
import math
import random
import re
import sqlite3
import time
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple

from . import rules_service


def _safe_json(raw: str | None) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        return {}


def _season_year_from_rules(rules: Dict[str, Any]) -> int:
    edition = str(rules.get("edition") or "")
    match = re.match(r"(\d{4})", edition)
    if match:
        return int(match.group(1))
    return datetime.now().year


def _parse_date(value: str) -> Optional[date]:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except Exception:
        return None


def _parse_date_range(value: str) -> Tuple[Optional[date], Optional[date]]:
    if not value:
        return None, None
    if "/" not in value:
        d = _parse_date(value)
        return d, d
    left, right = value.split("/", 1)
    left = left.strip()
    right = right.strip()
    start = _parse_date(left)
    if not start:
        return None, None
    if re.match(r"^\d{1,2}$", right):
        end = _parse_date(f"{left[:8]}{right.zfill(2)}")
        return start, end or start
    end = _parse_date(right)
    return start, end or start


def _in_window(day: date, windows: List[Tuple[date, date]]) -> bool:
    for start, end in windows:
        if start <= day <= end:
            return True
    return False


def _build_round_robin_cycle(team_ids: List[int]) -> List[List[Dict[str, int]]]:
    ids = team_ids[:]
    if len(ids) % 2 != 0:
        ids.append(-1)
    if len(ids) < 2:
        return []
    fixed = ids[0]
    rest = ids[1:]
    rounds: List[List[Dict[str, int]]] = []
    total_rounds = len(ids) - 1
    for round_idx in range(total_rounds):
        teams = [fixed] + rest
        half = len(teams) // 2
        pairings: List[Dict[str, int]] = []
        for i in range(half):
            home = teams[i]
            away = teams[-1 - i]
            if home == -1 or away == -1:
                continue
            flip = round_idx % 2 == 1
            pairings.append({"homeId": away if flip else home, "awayId": home if flip else away})
        rounds.append(pairings)
        rest = [rest[-1]] + rest[:-1]
    return rounds


def _swap_home_away(rounds: List[List[Dict[str, int]]]) -> List[List[Dict[str, int]]]:
    return [
        [{"homeId": p["awayId"], "awayId": p["homeId"]} for p in round_pairings]
        for round_pairings in rounds
    ]


def _build_round_robin(team_ids: List[int], cycles: int = 2) -> List[List[Dict[str, int]]]:
    if cycles <= 0:
        return []
    base = _build_round_robin_cycle(team_ids)
    rounds: List[List[Dict[str, int]]] = []
    for idx in range(cycles):
        cycle = base
        if idx % 2 == 1:
            cycle = _swap_home_away(cycle)
        rounds.extend(cycle)
    return rounds


def _build_rounds_for_games(
    team_ids: List[int],
    games_per_team: int,
    seed_key: str,
) -> List[List[Dict[str, int]]]:
    if not team_ids or games_per_team <= 0:
        return []
    team_count = len(team_ids)
    if team_count < 2:
        return []

    if team_count % 2 == 0:
        rounds_needed = games_per_team
        cycles_needed = int(math.ceil(rounds_needed / max(1, team_count - 1)))
    else:
        cycles_needed = int(math.ceil(games_per_team / max(1, team_count - 1)))
        rounds_needed = cycles_needed * team_count

    base_cycle = _build_round_robin_cycle(team_ids)
    rounds: List[List[Dict[str, int]]] = []
    rng = random.Random(seed_key)
    cycle_index = 0
    while len(rounds) < rounds_needed:
        cycle = list(base_cycle)
        rng.shuffle(cycle)
        if cycle_index % 2 == 1:
            cycle = _swap_home_away(cycle)
        rounds.extend(cycle)
        cycle_index += 1
    rounds = rounds[:rounds_needed]

    if team_count % 2 == 0:
        return rounds

    games_per_cycle = cycles_needed * (team_count - 1)
    drop_count = max(0, games_per_cycle - games_per_team)
    if drop_count == 0:
        return rounds

    pair_index: List[Tuple[int, int, Dict[str, int]]] = []
    for round_idx, round_pairings in enumerate(rounds):
        for pairing_idx, pairing in enumerate(round_pairings):
            pair_index.append((round_idx, pairing_idx, pairing))

    attempts = 6
    for attempt in range(attempts):
        drop_needed = {tid: drop_count for tid in team_ids}
        drop_set: set[Tuple[int, int]] = set()
        order = list(pair_index)
        rng.shuffle(order)
        for round_idx, pairing_idx, pairing in order:
            home = pairing["homeId"]
            away = pairing["awayId"]
            if drop_needed[home] > 0 and drop_needed[away] > 0:
                drop_set.add((round_idx, pairing_idx))
                drop_needed[home] -= 1
                drop_needed[away] -= 1
                if all(value == 0 for value in drop_needed.values()):
                    break
        if all(value == 0 for value in drop_needed.values()):
            filtered_rounds: List[List[Dict[str, int]]] = []
            for round_idx, round_pairings in enumerate(rounds):
                kept: List[Dict[str, int]] = []
                for pairing_idx, pairing in enumerate(round_pairings):
                    if (round_idx, pairing_idx) in drop_set:
                        continue
                    kept.append(pairing)
                if kept:
                    filtered_rounds.append(kept)
            return filtered_rounds

    games_played = {tid: 0 for tid in team_ids}
    filtered_rounds: List[List[Dict[str, int]]] = []
    for round_pairings in rounds:
        kept: List[Dict[str, int]] = []
        for pairing in round_pairings:
            home = pairing["homeId"]
            away = pairing["awayId"]
            if games_played.get(home, 0) >= games_per_team:
                continue
            if games_played.get(away, 0) >= games_per_team:
                continue
            kept.append(pairing)
            games_played[home] = games_played.get(home, 0) + 1
            games_played[away] = games_played.get(away, 0) + 1
        if kept:
            filtered_rounds.append(kept)
        if all(count >= games_per_team for count in games_played.values()):
            break
    return filtered_rounds


def _season_dates_from_rules(rules: Dict[str, Any]) -> Dict[str, Any]:
    return (
        rules.get("season_dates_2025_26")
        or rules.get("season_dates_2025")
        or rules.get("season_dates")
        or {}
    )


def _round_dates_from_rules(rules: Dict[str, Any], rounds: int | None = None) -> List[str]:
    competitions = rules.get("competitions") or {}
    liga = competitions.get("liga_regular") or competitions.get("regular_season") or {}
    explicit = liga.get("round_dates") or []
    if explicit:
        return [str(d) for d in explicit]
    structure = liga.get("structure", {}) or {}
    rounds = int(rounds or structure.get("regular_season_rounds") or 0)
    season_dates = _season_dates_from_rules(rules)
    start_value = (
        season_dates.get("regular_season_start")
        or season_dates.get("liga_regular_start")
        or season_dates.get("liga_endesa_start")
    )
    if not start_value:
        return []
    start = _parse_date(str(start_value))
    if not start and isinstance(start_value, str) and "/" in start_value:
        start, _ = _parse_date_range(start_value)
    if not start:
        return []
    windows_raw = liga.get("fiba_windows") or []
    windows = []
    for win in windows_raw:
        s = _parse_date(win.get("start") or "")
        e = _parse_date(win.get("end") or "")
        if s and e:
            windows.append((s, e))
    if rounds <= 0:
        return []

    end_value = (
        season_dates.get("regular_season_end")
        or season_dates.get("liga_regular_end")
        or season_dates.get("liga_endesa_end")
    )
    end = _parse_date(str(end_value)) if end_value else None
    if end and end > start and not windows:
        total_days = max(0, (end - start).days)
        if rounds == 1:
            return [start.isoformat()]
        step = total_days / max(1, rounds - 1)
        dates = []
        for i in range(rounds):
            offset = int(round(i * step))
            dates.append((start + timedelta(days=offset)).isoformat())
        return dates

    dates = []
    current = start
    for _ in range(rounds):
        while _in_window(current, windows):
            current = current + timedelta(days=1)
        dates.append(current.isoformat())
        current = current + timedelta(days=7)
    return dates


def _get_savegame(conn: sqlite3.Connection) -> Optional[Dict[str, Any]]:
    row = conn.execute(
        "SELECT id, current_season_id, data_json FROM savegame ORDER BY id LIMIT 1"
    ).fetchone()
    if not row:
        return None
    return {
        "id": int(row["id"]),
        "current_season_id": row["current_season_id"],
        "data": _safe_json(row["data_json"]),
    }


def _ensure_season(conn: sqlite3.Connection, savegame_id: int, rules: Dict[str, Any]) -> int:
    row = conn.execute(
        "SELECT id FROM season WHERE savegame_id = ? ORDER BY year DESC LIMIT 1",
        (savegame_id,),
    ).fetchone()
    if row:
        return int(row["id"])
    season_year = _season_year_from_rules(rules)
    season_dates = _season_dates_from_rules(rules)
    start_raw = (
        season_dates.get("regular_season_start")
        or season_dates.get("liga_regular_start")
        or season_dates.get("liga_endesa_start")
        or ""
    )
    end_raw = (
        season_dates.get("regular_season_end")
        or season_dates.get("playoff_end")
        or ""
    )
    start_date = start_raw
    end_date = end_raw
    if isinstance(start_raw, str) and "/" in start_raw:
        start, _ = _parse_date_range(start_raw)
        if start:
            start_date = start.isoformat()
    if isinstance(end_raw, str) and "/" in end_raw:
        end, _ = _parse_date_range(end_raw)
        if end:
            end_date = end.isoformat()
    now = int(time.time())
    cur = conn.execute(
        "INSERT INTO season (savegame_id, year, name, start_date, end_date, data_json, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            savegame_id,
            season_year,
            f"{season_year}-{str(season_year + 1)[-2:]}",
            start_date,
            end_date,
            json.dumps({"rules_edition": rules.get("edition")}, ensure_ascii=True),
            now,
        ),
    )
    season_id = int(cur.lastrowid)
    conn.execute(
        "UPDATE savegame SET current_season_id = ?, updated_at = ? WHERE id = ?",
        (season_id, now, savegame_id),
    )
    conn.commit()
    return season_id


def _ensure_competition(conn: sqlite3.Connection, savegame_id: int, league: Dict[str, Any]) -> int:
    league_id = str(league.get("id") or "").upper()
    name = str(league.get("name") or league_id)
    row = conn.execute(
        "SELECT id FROM competition WHERE savegame_id = ? AND league_id = ? AND name = ?",
        (savegame_id, league_id, name),
    ).fetchone()
    if row:
        return int(row["id"])
    now = int(time.time())
    cur = conn.execute(
        "INSERT INTO competition (savegame_id, league_id, name, level, universe, ruleset, data_json, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            savegame_id,
            league_id,
            name,
            int(league.get("level") or 1),
            str(league.get("universe") or ""),
            str(league.get("ruleset") or league_id),
            json.dumps({"kind": "league"}, ensure_ascii=True),
            now,
        ),
    )
    conn.commit()
    return int(cur.lastrowid)


def _team_map(conn: sqlite3.Connection) -> Dict[int, Dict[str, Any]]:
    rows = conn.execute("SELECT id, name, data_json FROM team ORDER BY id").fetchall()
    out: Dict[int, Dict[str, Any]] = {}
    for row in rows:
        data = _safe_json(row["data_json"])
        out[int(row["id"])] = {"id": int(row["id"]), "name": row["name"], "data": data}
    return out


def _teams_for_league(team_map: Dict[int, Dict[str, Any]], league_id: str) -> List[int]:
    ids = []
    for team_id, team in team_map.items():
        raw = team.get("data", {}).get("league_id") or team.get("data", {}).get("league") or ""
        if str(raw).upper() == str(league_id).upper():
            ids.append(team_id)
    return ids


def _ensure_fixtures(
    conn: sqlite3.Connection,
    season_id: int,
    competition_id: int,
    league_id: str,
    rules: Dict[str, Any],
    team_ids: List[int],
) -> None:
    row = conn.execute(
        "SELECT 1 FROM fixture WHERE season_id = ? AND competition_id = ? LIMIT 1",
        (season_id, competition_id),
    ).fetchone()
    if row:
        return
    competitions = rules.get("competitions") or {}
    liga = competitions.get("liga_regular") or competitions.get("regular_season") or {}
    structure = liga.get("structure", {}) or {}
    games_per_team = int(structure.get("regular_season_games") or 0)
    rounds_count = int(structure.get("regular_season_rounds") or 0)

    if games_per_team > 0:
        rounds = _build_rounds_for_games(team_ids, games_per_team, f"{league_id}:{season_id}")
    elif rounds_count > 0:
        rounds = _build_round_robin(team_ids)
        if len(rounds) < rounds_count:
            base_cycle = _build_round_robin_cycle(team_ids)
            rng = random.Random(f"{league_id}:{season_id}")
            cycle_index = 0
            while len(rounds) < rounds_count:
                cycle = list(base_cycle)
                rng.shuffle(cycle)
                if cycle_index % 2 == 1:
                    cycle = _swap_home_away(cycle)
                rounds.extend(cycle)
                cycle_index += 1
        rounds = rounds[:rounds_count]
    else:
        rounds = _build_round_robin(team_ids)
        rounds_count = len(rounds)

    round_dates = _round_dates_from_rules(rules, rounds=len(rounds))
    if round_dates and len(round_dates) < len(rounds):
        # Extend weekly if dates are shorter than needed
        last = _parse_date(round_dates[-1]) if round_dates else None
        if last:
            while len(round_dates) < len(rounds):
                last = last + timedelta(days=7)
                round_dates.append(last.isoformat())
    now = int(time.time())
    for round_idx, pairings in enumerate(rounds):
        round_no = round_idx + 1
        date_value = round_dates[round_idx] if round_idx < len(round_dates) else ""
        for pairing in pairings:
            conn.execute(
                "INSERT INTO fixture (season_id, competition_id, round, stage, home_team_id, away_team_id, date, time, status, home_score, away_score, data_json) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    season_id,
                    competition_id,
                    round_no,
                    "regular",
                    int(pairing["homeId"]),
                    int(pairing["awayId"]),
                    date_value,
                    "20:30",
                    "scheduled",
                    None,
                    None,
                    json.dumps({"competition": "liga", "created_at": now}, ensure_ascii=True),
                ),
            )
    conn.commit()


def ensure_competitions(conn: sqlite3.Connection) -> Dict[str, Any]:
    snapshot = rules_service.snapshot()
    leagues = snapshot.get("leagues") or []
    if not leagues:
        return {"ok": False, "error": "No leagues configured"}
    savegame = _get_savegame(conn)
    if not savegame:
        return {"ok": False, "error": "Savegame not found"}
    team_map = _team_map(conn)
    results = []
    for league in leagues:
        league_id = str(league.get("id") or "").upper()
        rules = league.get("rules") or {}
        season_id = _ensure_season(conn, savegame["id"], rules)
        comp_id = _ensure_competition(conn, savegame["id"], league)
        team_ids = _teams_for_league(team_map, league_id)
        if team_ids:
            _ensure_fixtures(conn, season_id, comp_id, league_id, rules, team_ids)
        results.append({"league_id": league_id, "competition_id": comp_id, "season_id": season_id})
    return {"ok": True, "items": results}


def _fetch_league_fixtures(
    conn: sqlite3.Connection,
    season_id: int,
    competition_id: int,
) -> List[Dict[str, Any]]:
    rows = conn.execute(
        "SELECT id, round, stage, home_team_id, away_team_id, date, time, status, home_score, away_score, data_json "
        "FROM fixture WHERE season_id = ? AND competition_id = ? ORDER BY round, date, id",
        (season_id, competition_id),
    ).fetchall()
    fixtures: List[Dict[str, Any]] = []
    for row in rows:
        played = row["home_score"] is not None and row["away_score"] is not None
        fixture = {
            "id": int(row["id"]),
            "round": int(row["round"] or 0),
            "stage": row["stage"],
            "homeId": int(row["home_team_id"]),
            "awayId": int(row["away_team_id"]),
            "date": row["date"],
            "time": row["time"],
            "competition": "liga",
            "played": played,
            "result": {"homeScore": row["home_score"], "awayScore": row["away_score"]} if played else None,
        }
        fixtures.append(fixture)
    return fixtures


def _compute_standings(fixtures: Iterable[Dict[str, Any]], teams: Dict[int, Dict[str, Any]]) -> List[Dict[str, Any]]:
    base: Dict[int, Dict[str, Any]] = {}
    for team_id, team in teams.items():
        base[team_id] = {
            "id": team_id,
            "name": team["name"],
            "w": 0,
            "l": 0,
            "pf": 0,
            "pa": 0,
        }
    for fixture in fixtures:
        result = fixture.get("result")
        if not result:
            continue
        home = base.get(int(fixture["homeId"]))
        away = base.get(int(fixture["awayId"]))
        if not home or not away:
            continue
        home_score = int(result.get("homeScore") or 0)
        away_score = int(result.get("awayScore") or 0)
        home["pf"] += home_score
        home["pa"] += away_score
        away["pf"] += away_score
        away["pa"] += home_score
        if home_score > away_score:
            home["w"] += 1
            away["l"] += 1
        else:
            away["w"] += 1
            home["l"] += 1
    rows = []
    for row in base.values():
        total = row["w"] + row["l"]
        diff = row["pf"] - row["pa"]
        pct = round(row["w"] / total, 3) if total else 0
        rows.append({**row, "diff": diff, "pct": pct})
    rows.sort(key=lambda r: (r["w"], r["diff"]), reverse=True)
    return rows


def _group_rounds(fixtures: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_round: Dict[int, Dict[str, Any]] = {}
    for fixture in fixtures:
        round_no = int(fixture.get("round") or 0)
        if round_no not in by_round:
            by_round[round_no] = {"round": round_no, "date": fixture.get("date"), "fixtures": []}
        by_round[round_no]["fixtures"].append(fixture)
    return [by_round[key] for key in sorted(by_round.keys())]


def _fixtures_by_date(fixtures: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    out: Dict[str, List[Dict[str, Any]]] = {}
    for fixture in fixtures:
        date_value = fixture.get("date") or ""
        if not date_value:
            continue
        out.setdefault(date_value, []).append(fixture)
    return out


def _standings_at_round(fixtures: List[Dict[str, Any]], teams: Dict[int, Dict[str, Any]], cutoff_round: int) -> List[Dict[str, Any]]:
    filtered = [f for f in fixtures if int(f.get("round") or 0) <= cutoff_round]
    return _compute_standings(filtered, teams)


def _build_copa_bracket(
    standings: List[Dict[str, Any]],
    rules: Dict[str, Any],
) -> Dict[str, Any]:
    season_dates = rules.get("season_dates_2025_26") or {}
    if not season_dates.get("copa_del_rey"):
        return {"current_round": "", "matches": []}
    top = standings[:8]
    seeds = [row["id"] for row in top]
    if len(seeds) < 8:
        return {"current_round": "", "matches": []}
    pairings = [(0, 7), (1, 6), (2, 5), (3, 4)]
    dates = []
    start, end = _parse_date_range(str(season_dates.get("copa_del_rey") or ""))
    if start:
        dates = [start, start + timedelta(days=1), start + timedelta(days=3)]
    matches = []
    for idx, (a, b) in enumerate(pairings):
        match_date = dates[0].isoformat() if dates else ""
        matches.append(
            {
                "id": f"copa-qf-{idx + 1}",
                "round": "Cuartos",
                "home": seeds[a],
                "away": seeds[b],
                "date": match_date,
                "played": False,
            }
        )
    return {"current_round": "Cuartos", "matches": matches}


def _build_supercopa_bracket(
    standings: List[Dict[str, Any]],
    rules: Dict[str, Any],
) -> Dict[str, Any]:
    season_dates = rules.get("season_dates_2025_26") or {}
    if not season_dates.get("supercopa_endesa"):
        return {"current_round": "", "matches": []}
    top = standings[:4]
    seeds = [row["id"] for row in top]
    if len(seeds) < 4:
        return {"current_round": "", "matches": []}
    start, _end = _parse_date_range(str(season_dates.get("supercopa_endesa") or ""))
    match_date = start.isoformat() if start else ""
    matches = [
        {"id": "supercopa-sf-1", "round": "Semifinales", "home": seeds[0], "away": seeds[3], "date": match_date, "played": False},
        {"id": "supercopa-sf-2", "round": "Semifinales", "home": seeds[1], "away": seeds[2], "date": match_date, "played": False},
    ]
    return {"current_round": "Semifinales", "matches": matches}


def _build_playoff_bracket(
    standings: List[Dict[str, Any]],
    rules: Dict[str, Any],
) -> Dict[str, Any]:
    playoff = (rules.get("competitions") or {}).get("playoff_ascenso") or {}
    if not playoff:
        return {"current_round": "", "matches": []}
    seeds = [row["id"] for row in standings[1:9]]
    if len(seeds) < 8:
        return {"current_round": "", "matches": []}
    pairings = playoff.get("pairings") or [
        {"seed1": 2, "seed2": 9},
        {"seed1": 3, "seed2": 8},
        {"seed1": 4, "seed2": 7},
        {"seed1": 5, "seed2": 6},
    ]
    start = _parse_date((rules.get("season_dates_2025_26") or {}).get("playoff_quarters_start") or "")
    match_date = start.isoformat() if start else ""
    seed_map = {2: seeds[0], 3: seeds[1], 4: seeds[2], 5: seeds[3], 6: seeds[4], 7: seeds[5], 8: seeds[6], 9: seeds[7]}
    matches = []
    for idx, pairing in enumerate(pairings):
        home = seed_map.get(pairing.get("seed1"))
        away = seed_map.get(pairing.get("seed2"))
        if not home or not away:
            continue
        matches.append(
            {
                "id": f"ascenso-qf-{idx + 1}",
                "round": "Cuartos",
                "home": home,
                "away": away,
                "date": match_date,
                "played": False,
            }
        )
    return {"current_round": "Cuartos", "matches": matches}


def snapshot(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    league_id = str(payload.get("league_id") or "").upper()
    ensure = bool(payload.get("ensure"))
    if ensure:
        ensure_competitions(conn)
    snapshot_rules = rules_service.snapshot()
    league_rules = None
    league_entry = None
    for league in snapshot_rules.get("leagues") or []:
        if str(league.get("id") or "").upper() == league_id:
            league_entry = league
            league_rules = league.get("rules") or {}
            break
    if not league_entry:
        return {"ok": False, "error": "League not found"}
    savegame = _get_savegame(conn)
    if not savegame:
        return {"ok": False, "error": "Savegame not found"}
    season_id = savegame.get("current_season_id")
    if not season_id:
        season_id = _ensure_season(conn, savegame["id"], league_rules or {})
    comp_row = conn.execute(
        "SELECT id FROM competition WHERE league_id = ? ORDER BY id LIMIT 1",
        (league_id,),
    ).fetchone()
    if not comp_row:
        comp_id = _ensure_competition(conn, savegame["id"], league_entry)
    else:
        comp_id = int(comp_row["id"])
    team_map = _team_map(conn)
    league_team_ids = _teams_for_league(team_map, league_id)
    teams = {tid: team_map[tid] for tid in league_team_ids}
    fixtures = _fetch_league_fixtures(conn, season_id, comp_id)
    rounds = _group_rounds(fixtures)
    standings = _compute_standings(fixtures, teams)
    cup_brackets = {
        "copa": _build_copa_bracket(_standings_at_round(fixtures, teams, 17), league_rules or {}),
        "supercopa": _build_supercopa_bracket(standings, league_rules or {}),
        "playoff": _build_playoff_bracket(standings, league_rules or {}),
    }
    return {
        "ok": True,
        "snapshot": {
            "league_id": league_id,
            "rounds": rounds,
            "fixtures_by_date": _fixtures_by_date(fixtures),
            "standings": standings,
            "cup_brackets": cup_brackets,
        },
    }


def record_result(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    fixture_id = payload.get("fixture_id")
    home_score = payload.get("home_score")
    away_score = payload.get("away_score")
    if not fixture_id:
        return {"ok": False, "error": "fixture_id required"}
    if home_score is None or away_score is None:
        return {"ok": False, "error": "home_score and away_score required"}
    now = int(time.time())
    row = conn.execute("SELECT data_json FROM fixture WHERE id = ?", (int(fixture_id),)).fetchone()
    data = _safe_json(row["data_json"]) if row else {}
    data["played_at"] = now
    conn.execute(
        "UPDATE fixture SET home_score = ?, away_score = ?, status = ?, data_json = ? WHERE id = ?",
        (int(home_score), int(away_score), "played", json.dumps(data, ensure_ascii=True), int(fixture_id)),
    )
    conn.commit()
    return {"ok": True, "fixture_id": int(fixture_id)}
