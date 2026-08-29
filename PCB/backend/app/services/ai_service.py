from __future__ import annotations

import json
import random
import sqlite3
import time
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

from . import market_service, match_service, club_service, youth_service


POSITIONS = ["PG", "SG", "SF", "PF", "C"]
LEAGUE_PERIODS = {
    "NBA": 4,
    "WNBA": 4,
    "FIBA": 4,
    "ACB": 4,
    "FEB": 4,
    "NCAA_M": 2,
    "NCAA_W": 4,
}
LEAGUE_TOTAL_MINUTES = {
    "NBA": 48,
    "WNBA": 40,
    "FIBA": 40,
    "ACB": 40,
    "FEB": 40,
    "NCAA_M": 40,
    "NCAA_W": 40,
}

ROLE_BY_POS = {
    "PG": {"role": "Director", "duty": "Apoyo"},
    "SG": {"role": "Francotirador", "duty": "Ataque"},
    "SF": {"role": "3&D", "duty": "Defensa"},
    "PF": {"role": "Defensor interior", "duty": "Defensa"},
    "C": {"role": "Protector aro", "duty": "Defensa"},
}

ATTR_GROUPS = {
    "shooting": ["three_static", "three_off_dribble", "mid_range", "free_throw", "off_screen_shot", "shot_selection"],
    "finishing": ["finishing_close", "contact_finishing", "dunking", "floater", "hook_shot", "post_scoring", "fadeaway"],
    "playmaking": [
        "court_vision",
        "pass_short",
        "pass_long",
        "pass_bounce",
        "pass_post",
        "pass_speed",
        "creativity",
        "ball_control",
        "ball_protect",
        "off_hand_dribble",
    ],
    "defense_perimeter": ["def_perimeter", "steal_onball", "screen_nav", "closeout", "def_pnr_inside", "def_transition", "help_defense"],
    "defense_rim": ["def_post", "block", "intimidation", "box_out", "reb_def", "help_defense"],
    "rebounding": ["reb_def", "box_out", "second_jump", "strength_static"],
    "athletic": ["acceleration", "speed_top", "agility_lat", "deceleration", "vert_static", "vert_run", "strength_explo", "stamina"],
    "mental": ["consistency", "work_ethic", "mental_tough", "court_leadership", "professionalism", "pressure_res", "adaptability"],
}

POS_WEIGHTS = {
    "PG": {"playmaking": 0.36, "shooting": 0.18, "defense_perimeter": 0.18, "athletic": 0.16, "mental": 0.12},
    "SG": {"shooting": 0.3, "playmaking": 0.16, "defense_perimeter": 0.2, "athletic": 0.2, "mental": 0.14},
    "SF": {"shooting": 0.22, "finishing": 0.22, "defense_perimeter": 0.22, "athletic": 0.2, "mental": 0.14},
    "PF": {"finishing": 0.26, "defense_rim": 0.24, "rebounding": 0.2, "athletic": 0.18, "mental": 0.12},
    "C": {"defense_rim": 0.3, "rebounding": 0.22, "finishing": 0.2, "athletic": 0.16, "mental": 0.12},
}

STYLE_BIASES = {
    "tempo": {"athletic": 0.14, "playmaking": 0.06},
    "spacing": {"shooting": 0.16, "playmaking": 0.04},
    "post": {"finishing": 0.16, "rebounding": 0.08},
    "defense": {"defense_perimeter": 0.12, "defense_rim": 0.12},
    "balance": {},
}


def _parse_date(value: str | None) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except Exception:
        return None


def _player_position(player: Dict[str, Any]) -> str:
    data = player.get("data") or {}
    pos = data.get("position") or (data.get("bio") or {}).get("pos") or ""
    return str(pos).upper()


def _player_available(player: Dict[str, Any]) -> bool:
    health = (player.get("data") or {}).get("health") or {}
    status = str(health.get("injury_status") or health.get("status") or "").lower()
    return status != "out"


def _player_age(player: Dict[str, Any]) -> int:
    data = player.get("data") or {}
    age = (data.get("bio") or {}).get("age")
    try:
        return int(age)
    except (TypeError, ValueError):
        return 25


def _attr_value(attrs: Dict[str, Any], key: str) -> int:
    try:
        return int(attrs.get(key) or 0)
    except (TypeError, ValueError):
        return 0


def _player_market_value(player: Dict[str, Any]) -> int:
    data = player.get("data") or {}
    try:
        return int(data.get("market_value") or 0)
    except (TypeError, ValueError):
        return 0


def _avg_attr(attrs: Dict[str, Any], keys: List[str]) -> float:
    values = [_attr_value(attrs, key) for key in keys]
    cleaned = [v for v in values if v > 0]
    if not cleaned:
        return 0.0
    return sum(cleaned) / max(1, len(cleaned))


def _player_signature(player: Dict[str, Any]) -> Dict[str, float]:
    attrs = (player.get("data") or {}).get("attributes") or {}
    signature = {}
    for group, keys in ATTR_GROUPS.items():
        signature[group] = _avg_attr(attrs, keys)
    signature["peak"] = max(signature.values()) if signature else 0.0
    signature["floor"] = min(signature.values()) if signature else 0.0
    return signature


def _style_bias(style: str) -> Dict[str, float]:
    return STYLE_BIASES.get(str(style or "").lower(), STYLE_BIASES["balance"])


def _player_fit_score(player: Dict[str, Any], pos: str, style: str) -> float:
    signature = _player_signature(player)
    weights = POS_WEIGHTS.get(str(pos or "").upper(), POS_WEIGHTS["SF"])
    base = sum(signature.get(group, 0.0) * weight for group, weight in weights.items())
    bias = _style_bias(style)
    if bias:
        base += sum(signature.get(group, 0.0) * weight for group, weight in bias.items())
    return base


def _player_impact(player: Dict[str, Any], pos: Optional[str], style: str) -> float:
    if pos:
        return _player_fit_score(player, pos, style)
    best = 0.0
    for candidate_pos in POSITIONS:
        best = max(best, _player_fit_score(player, candidate_pos, style))
    return best


def _player_ceiling(player: Dict[str, Any], pos: str, style: str) -> float:
    signature = _player_signature(player)
    impact = _player_fit_score(player, pos, style)
    age = _player_age(player)
    growth = max(0.0, 26 - age) * 1.6
    mental = signature.get("mental", 0.0)
    return impact * 0.7 + signature.get("peak", 0.0) * 0.2 + mental * 0.1 + growth


def _team_league_id(team_data: Dict[str, Any]) -> str:
    raw = team_data.get("league_id") or team_data.get("league") or team_data.get("leagueId")
    return str(raw or "ACB").upper()


def _ensure_ai_profile(team_data: Dict[str, Any], rng: random.Random) -> Dict[str, Any]:
    profile = team_data.get("ai_profile")
    if isinstance(profile, dict) and profile.get("strategy"):
        return profile

    budget = int(team_data.get("budget") or 0)
    tier = int(team_data.get("tier") or 2)
    reputation = int(team_data.get("reputation") or 500)

    if tier <= 1 and reputation >= 760:
        strategy = "win_now"
    elif tier >= 3 and budget < 1_000_000:
        strategy = "rebuild"
    else:
        strategy = "balanced"

    risk = 0.15 + (0.08 if strategy == "win_now" else -0.02 if strategy == "rebuild" else 0.0)
    risk = max(0.05, min(0.35, risk + rng.uniform(-0.05, 0.05)))
    scout_tier = 2 if budget >= 3_500_000 else 3 if budget >= 2_000_000 else 4
    scout_tier = max(1, min(6, scout_tier + rng.choice([-1, 0, 1])))

    profile = {
        "strategy": strategy,
        "risk": round(risk, 3),
        "scout_tier": scout_tier,
        "style": rng.choice(["balance", "tempo", "spacing", "post", "defense"]),
        "pace": rng.choice(["slow", "balanced", "fast"]),
        "shot_profile": rng.choice(["rim", "mixed", "three"]),
        "defense_scheme": rng.choice(["drop", "switch", "aggressive"]),
        "rotation_depth": rng.randint(7, 9),
        "development_focus": strategy == "rebuild",
        "identity_updated": "",
    }
    team_data["ai_profile"] = profile
    return profile


def _perceived(value: int, tier: int, rng: random.Random) -> int:
    noise = {1: 25, 2: 45, 3: 70, 4: 110, 5: 150, 6: 190}.get(int(tier or 3), 90)
    return max(1, min(1000, int(value + rng.randint(-noise, noise))))


def _score_candidate(
    player: Dict[str, Any],
    need_pos: str,
    profile: Dict[str, Any],
    budget: int,
    rng: random.Random,
) -> float:
    tier = int(profile.get("scout_tier") or 3)
    style = profile.get("style") or "balance"
    impact = _perceived(int(_player_impact(player, need_pos, style)), tier, rng)
    ceiling = _perceived(int(_player_ceiling(player, need_pos, style)), tier, rng)
    age = _player_age(player)
    market_value = _player_market_value(player)
    pos = _player_position(player)

    strategy = profile.get("strategy")
    if strategy == "win_now":
        score = impact * 1.2 + ceiling * 0.25 - age * 6
    elif strategy == "rebuild":
        score = impact * 0.55 + ceiling * 1.2 - age * 10
    else:
        score = impact * 0.9 + ceiling * 0.7 - age * 7

    if pos == need_pos:
        score += 160
    elif pos in POSITIONS:
        score += 30

    if budget > 0 and market_value > 0:
        score -= (market_value / budget) * 120

    score += rng.uniform(-30, 30)
    return score


def _split_minutes(total_minutes: int, period_count: int) -> List[int]:
    if period_count <= 0:
        return []
    base = max(0, total_minutes) // period_count
    remainder = max(0, total_minutes) % period_count
    periods = []
    for idx in range(period_count):
        extra = 1 if idx < remainder else 0
        periods.append(base + extra)
    return periods


def _build_rotation(
    roster: List[Dict[str, Any]],
    league_id: str,
    profile: Dict[str, Any],
    rng: random.Random,
) -> Dict[str, Any]:
    if not roster:
        return {"players": []}

    league_key = str(league_id or "FIBA").upper()
    period_count = LEAGUE_PERIODS.get(league_key, 4)
    total_minutes = LEAGUE_TOTAL_MINUTES.get(league_key, 40)

    style = profile.get("style") or "balance"
    roster_sorted = sorted(roster, key=lambda p: _player_impact(p, _player_position(p), style), reverse=True)
    starters: Dict[str, Dict[str, Any]] = {}
    used_ids = set()
    for pos in POSITIONS:
        candidates = [
            p
            for p in roster_sorted
            if _player_position(p) == pos and p["id"] not in used_ids
        ]
        if candidates:
            starters[pos] = candidates[0]
            used_ids.add(candidates[0]["id"])

    while len(used_ids) < 5 and roster_sorted:
        for player in roster_sorted:
            if player["id"] not in used_ids:
                starters[POSITIONS[len(used_ids)]] = player
                used_ids.add(player["id"])
                break

    bench_pool = [p for p in roster_sorted if p["id"] not in used_ids]
    rotation_depth = int(profile.get("rotation_depth") or 8)
    bench_count = min(max(2, rotation_depth - 5), len(bench_pool))
    bench = bench_pool[:bench_count]

    if rotation_depth >= 9:
        starter_min = int(total_minutes * 0.66)
    elif rotation_depth == 8:
        starter_min = int(total_minutes * 0.7)
    else:
        starter_min = int(total_minutes * 0.76)
    total_team_minutes = total_minutes * 5
    starters_total = starter_min * 5
    bench_total = max(0, total_team_minutes - starters_total)
    bench_minutes: List[int] = []
    if bench_count:
        weights = [max(1.0, _player_impact(p, _player_position(p), style)) for p in bench]
        total_weight = sum(weights) or 1.0
        allocated = 0
        for idx, weight in enumerate(weights):
            if idx == bench_count - 1:
                minutes = max(0, bench_total - allocated)
            else:
                minutes = int(round((bench_total * weight) / total_weight))
            minutes = max(4, minutes)
            bench_minutes.append(minutes)
            allocated += minutes
        if bench_minutes:
            bench_minutes[-1] = max(0, bench_total - sum(bench_minutes[:-1]))

    rotation_players = []
    for pos in POSITIONS:
        player = starters.get(pos)
        if not player:
            continue
        minutes = starter_min
        rotation_players.append(
            {
                "playerId": player["id"],
                "periods": _split_minutes(minutes, period_count),
                "totalMinutes": minutes,
            }
        )

    for player, minutes in zip(bench, bench_minutes):
        rotation_players.append(
            {
                "playerId": player["id"],
                "periods": _split_minutes(minutes, period_count),
                "totalMinutes": minutes,
            }
        )

    return {"players": rotation_players}


def _build_tactics(roster: List[Dict[str, Any]], profile: Dict[str, Any]) -> Dict[str, Any]:
    roles_by_player = {}
    for player in roster:
        pos = _player_position(player)
        role = ROLE_BY_POS.get(pos)
        if not role:
            continue
        roles_by_player[player["id"]] = role
    style = str(profile.get("style") or "balance").lower()
    pace = str(profile.get("pace") or "balanced").lower()
    shot_profile = str(profile.get("shot_profile") or "mixed").lower()
    defense_scheme = str(profile.get("defense_scheme") or "drop").lower()
    strategy = str(profile.get("strategy") or "balanced").lower()

    pace_map = {"slow": 0, "balanced": 2, "fast": 4}
    focus_map = {"three": "perimeter", "rim": "post", "mixed": "balanced"}
    defense_map = {"switch": "switch", "drop": "drop", "aggressive": "aggressive"}
    config = {
        "pace": pace_map.get(pace, 2),
        "focus": focus_map.get(shot_profile, "balanced"),
        "freedom": 1 if strategy == "win_now" else 3 if strategy == "rebuild" else 2,
        "defenseType": defense_map.get(defense_scheme, "drop"),
        "transition": 3 if pace == "fast" else 1,
        "offRebound": 3 if style in {"post", "defense"} else 1,
        "threePoint": 68 if style == "spacing" else 42 if style == "post" else 54,
    }
    return {
        "rolesByPlayer": roles_by_player,
        "matchups": {},
        "instructions": {},
        "config": config,
        "identity": {
            "style": profile.get("style"),
            "pace": profile.get("pace"),
            "shot_profile": profile.get("shot_profile"),
            "defense_scheme": profile.get("defense_scheme"),
        },
    }


def _default_targets(roster_size: int, profile: Dict[str, Any], rng: random.Random) -> Dict[str, int]:
    targets = {pos: 2 for pos in POSITIONS}
    style = str(profile.get("style") or "balance")
    if style == "spacing":
        targets["SG"] += 1
        targets["SF"] += 1
    elif style == "post":
        targets["PF"] += 1
        targets["C"] += 1
    elif style == "tempo":
        targets["PG"] += 1
    remaining = max(0, int(roster_size) - 10)
    for _ in range(remaining):
        targets[rng.choice(POSITIONS)] += 1
    return targets


def _team_signature(roster: List[Dict[str, Any]]) -> Dict[str, float]:
    if not roster:
        return {group: 0.0 for group in ATTR_GROUPS}
    ranked = sorted(
        roster,
        key=lambda p: _player_impact(p, _player_position(p), "balance"),
        reverse=True,
    )
    core = ranked[:8] if len(ranked) >= 8 else ranked
    totals = {group: 0.0 for group in ATTR_GROUPS}
    for player in core:
        signature = _player_signature(player)
        for group in ATTR_GROUPS:
            totals[group] += signature.get(group, 0.0)
    count = max(1, len(core))
    return {group: totals[group] / count for group in totals}


def _infer_style(signature: Dict[str, float], rng: random.Random) -> str:
    shooting = signature.get("shooting", 0.0)
    finishing = signature.get("finishing", 0.0)
    defense = signature.get("defense_perimeter", 0.0) + signature.get("defense_rim", 0.0)
    rebounding = signature.get("rebounding", 0.0)
    athletic = signature.get("athletic", 0.0)

    if defense >= (shooting + finishing) * 1.05 and defense >= 120:
        return "defense"
    if shooting >= 68 and athletic >= 62:
        return "spacing" if rng.random() < 0.55 else "tempo"
    if finishing + rebounding >= 128:
        return "post"
    if athletic >= 70 and shooting >= 60:
        return "tempo"
    return "balance"


def _refresh_ai_identity(
    team_data: Dict[str, Any],
    roster: List[Dict[str, Any]],
    profile: Dict[str, Any],
    current_date: date,
    rng: random.Random,
) -> Dict[str, Any]:
    updated_key = current_date.isoformat()
    if profile.get("identity_updated") == updated_key:
        return profile

    signature = _team_signature(roster)
    style = profile.get("style") or _infer_style(signature, rng)
    if profile.get("style") != style:
        profile["style"] = style

    athletic = signature.get("athletic", 0.0)
    shooting = signature.get("shooting", 0.0)
    finishing = signature.get("finishing", 0.0)
    defense_per = signature.get("defense_perimeter", 0.0)
    defense_rim = signature.get("defense_rim", 0.0)

    if style == "tempo" or athletic >= 70:
        pace = "fast"
    elif style == "defense" and athletic <= 58:
        pace = "slow"
    else:
        pace = "balanced"

    if style == "spacing" or shooting >= 68:
        shot_profile = "three"
    elif style == "post" or finishing >= 68:
        shot_profile = "rim"
    else:
        shot_profile = "mixed"

    if defense_per >= defense_rim + 6:
        defense_scheme = "switch"
    elif defense_rim >= defense_per + 6:
        defense_scheme = "drop"
    else:
        defense_scheme = "aggressive"

    strategy = profile.get("strategy") or "balanced"
    if strategy == "win_now":
        base_depth = 7
    elif strategy == "rebuild":
        base_depth = 9
    else:
        base_depth = 8

    staff_perf = team_data.get("staff_performance") if isinstance(team_data.get("staff_performance"), dict) else {}
    coaching = staff_perf.get("by_department", {}).get("COACHING")
    try:
        coaching_val = float(coaching) if coaching is not None else None
    except (TypeError, ValueError):
        coaching_val = None
    if coaching_val is not None:
        if coaching_val >= 70:
            base_depth += 1
        elif coaching_val <= 45:
            base_depth = max(6, base_depth - 1)

    profile.update(
        {
            "style": style,
            "pace": pace,
            "shot_profile": shot_profile,
            "defense_scheme": defense_scheme,
            "rotation_depth": max(6, min(10, int(base_depth))),
            "development_focus": strategy == "rebuild",
            "identity_updated": updated_key,
        }
    )
    team_data["ai_profile"] = profile
    team_data["ai_identity"] = {"signature": signature, "updated": updated_key}
    return profile


def _simulate_fixtures_for_date(
    conn: sqlite3.Connection,
    current_date: date,
    human_team_id: Optional[int],
    active_leagues: Optional[set[str]],
) -> int:
    if not current_date:
        return 0
    params: List[Any] = [current_date.isoformat()]
    league_clause = ""
    if active_leagues:
        placeholders = ",".join("?" for _ in active_leagues)
        league_clause = f" AND UPPER(c.league_id) IN ({placeholders})"
        params.extend(sorted(active_leagues))

    rows = conn.execute(
        f"""
        SELECT f.id, f.home_team_id, f.away_team_id, c.ruleset
        FROM fixture f
        JOIN competition c ON f.competition_id = c.id
        WHERE f.date = ? AND (f.status IS NULL OR f.status != 'played')
        {league_clause}
        """,
        params,
    ).fetchall()
    simulated = 0
    for row in rows:
        try:
            home_id = int(row["home_team_id"])
            away_id = int(row["away_team_id"])
        except (TypeError, ValueError):
            continue
        if human_team_id and (home_id == human_team_id or away_id == human_team_id):
            continue
        try:
            match_service.simulate(
                conn,
                {
                    "home_team_id": home_id,
                    "away_team_id": away_id,
                    "fixture_id": int(row["id"]),
                    "ruleset": row["ruleset"] or "FIBA",
                    "stream": False,
                    "apply_post_match": True,
                    "current_date": current_date.isoformat(),
                },
            )
            simulated += 1
        except Exception:
            continue
    return simulated


def advance_day(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    current_date = _parse_date(str(payload.get("current_date") or "")) or date.today()
    human_team_id = payload.get("human_team_id")
    try:
        human_team_id = int(human_team_id) if human_team_id is not None else None
    except (TypeError, ValueError):
        human_team_id = None

    active_leagues = payload.get("league_ids")
    active_set = None
    if isinstance(active_leagues, list):
        active_set = {str(item).upper() for item in active_leagues if item}

    teams = conn.execute("SELECT id, name, data_json FROM team").fetchall()
    players = conn.execute("SELECT id, name, data_json FROM player").fetchall()

    team_map: Dict[int, Dict[str, Any]] = {}
    for row in teams:
        team_map[int(row["id"])] = {
            "id": int(row["id"]),
            "name": row["name"],
            "data": json.loads(row["data_json"]) if row["data_json"] else {},
        }

    players_by_team: Dict[int, List[Dict[str, Any]]] = {}
    all_players: List[Dict[str, Any]] = []
    for row in players:
        data = json.loads(row["data_json"]) if row["data_json"] else {}
        player = {"id": int(row["id"]), "name": row["name"], "data": data}
        all_players.append(player)
        team_id = data.get("team_id")
        if team_id is not None:
            try:
                team_id = int(team_id)
            except (TypeError, ValueError):
                continue
            players_by_team.setdefault(team_id, []).append(player)

    updated = 0
    offers = 0
    shortlist_adds = 0

    for team_id, team in team_map.items():
        if human_team_id and team_id == human_team_id:
            continue
        team_data = team.get("data") or {}
        league_id = _team_league_id(team_data)
        if active_set and league_id not in active_set:
            continue
        ai_state = team_data.get("ai_state") if isinstance(team_data.get("ai_state"), dict) else {}
        if ai_state.get("last_date") == current_date.isoformat():
            continue

        club_service.refresh_staff_performance(team_id, team_data, current_date.isoformat())
        club_service.apply_facility_upkeep(team_data, current_date.isoformat())

        seed = team_id * 100000 + int(current_date.strftime("%Y%m%d"))
        rng = random.Random(seed)

        profile = _ensure_ai_profile(team_data, rng)
        roster = players_by_team.get(team_id, [])
        available_roster = [p for p in roster if _player_available(p)]
        if len(available_roster) < 5:
            available_roster = roster
        roster_size = int(team_data.get("roster_size") or 12)
        league_id = _team_league_id(team_data)

        profile = _refresh_ai_identity(team_data, roster, profile, current_date, rng)

        rotation = _build_rotation(available_roster, league_id, profile, rng)
        tactics = _build_tactics(available_roster, profile)
        playbook = {"primaryFocus": "Balance", "primaryType": "Motion"}
        style = profile.get("style")
        if style == "tempo":
            playbook = {"primaryFocus": "Transition", "primaryType": "Flow"}
        elif style == "spacing":
            playbook = {"primaryFocus": "3PT", "primaryType": "Flow"}
        elif style == "post":
            playbook = {"primaryFocus": "Post", "primaryType": "Set"}
        elif style == "defense":
            playbook = {"primaryFocus": "Balance", "primaryType": "Set"}
        team_data["match_tactics"] = {
            "tactics": tactics,
            "rotation": rotation,
            "playbook": playbook,
            "identity": {
                "style": profile.get("style"),
                "pace": profile.get("pace"),
                "shot_profile": profile.get("shot_profile"),
                "defense_scheme": profile.get("defense_scheme"),
            },
        }

        targets = _default_targets(roster_size, profile, rng)
        counts = {pos: 0 for pos in POSITIONS}
        for player in roster:
            pos = _player_position(player)
            if pos in counts:
                counts[pos] += 1

        deficits = [pos for pos, target in targets.items() if counts.get(pos, 0) < target]
        base_offers = 2 if profile.get("strategy") == "win_now" else 1
        if float(profile.get("risk") or 0) >= 0.22:
            base_offers += 1
        max_offers = max(1, min(3, base_offers))
        offers_made = 0
        actions: List[str] = []

        if deficits and len(roster) < roster_size:
            shortlist = team_data.get("shortlist", []) if isinstance(team_data.get("shortlist"), list) else []
            shortlist_ids = {int(item.get("player_id")) for item in shortlist if item.get("player_id")}
            budget = int(team_data.get("budget") or 0)
            development_focus = bool(profile.get("development_focus"))
            age_ceiling = 23 if development_focus else 29

            for need_pos in deficits:
                candidates: List[Tuple[float, Dict[str, Any]]] = []
                for candidate in all_players:
                    cand_data = candidate.get("data") or {}
                    cand_team_id = cand_data.get("team_id")
                    if cand_team_id is not None:
                        try:
                            cand_team_id = int(cand_team_id)
                        except (TypeError, ValueError):
                            continue
                    if cand_team_id == team_id:
                        continue
                    if human_team_id and cand_team_id == human_team_id:
                        continue
                    if cand_team_id is not None:
                        cand_team = team_map.get(cand_team_id)
                        cand_league = _team_league_id(cand_team.get("data") or {}) if cand_team else None
                        if cand_league and cand_league != league_id:
                            continue
                    cand_age = _player_age(candidate)
                    if cand_age > age_ceiling and development_focus:
                        continue
                    score = _score_candidate(candidate, need_pos, profile, budget, rng)
                    candidates.append((score, candidate))

                if not candidates:
                    continue
                candidates.sort(key=lambda item: item[0], reverse=True)
                top_candidates = [c for _, c in candidates[:5]]
                target_player = rng.choice(top_candidates) if top_candidates else None
                if not target_player:
                    continue

                if target_player["id"] not in shortlist_ids:
                    res = market_service.add_to_shortlist(conn, team_id, target_player["id"], priority="high")
                    if res.get("ok"):
                        shortlist_adds += 1
                        actions.append(f"shortlist:{target_player['id']}")

                if offers_made < max_offers:
                    mv = _player_market_value(target_player)
                    fee_factor = 1.05 if profile.get("strategy") == "win_now" else 0.9
                    fee = int(mv * fee_factor) if mv > 0 else 0
                    offer = {
                        "fee": fee,
                        "wage": max(0, int(mv / 12)) if mv > 0 else 0,
                        "contract_years": 3 if profile.get("strategy") == "rebuild" else 2,
                        "current_date": current_date.isoformat(),
                    }
                    res = market_service.make_offer(conn, team_id, target_player["id"], offer)
                    if res.get("ok"):
                        offers_made += 1
                        offers += 1
                        actions.append(f"offer:{target_player['id']}")

        ai_state = {
            "last_date": current_date.isoformat(),
            "last_actions": actions,
        }
        team_data["ai_state"] = ai_state

        conn.execute(
            "UPDATE team SET data_json = ?, updated_at = ? WHERE id = ?",
            (json.dumps(team_data, ensure_ascii=True), int(time.time()), team_id),
        )
        updated += 1
        try:
            youth_service.advance_day(conn, int(team_id), current_date, emit_events=False)
        except Exception:
            pass

    conn.commit()

    simulated_matches = _simulate_fixtures_for_date(conn, current_date, human_team_id, active_set)
    return {
        "ok": True,
        "updated": updated,
        "offers": offers,
        "shortlists": shortlist_adds,
        "simulated_matches": simulated_matches,
    }
