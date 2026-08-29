from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict


@dataclass(frozen=True)
class CourtRules:
    length_m: float
    width_m: float
    rim_x_from_baseline_m: float
    rim_height_m: float
    three_arc_radius_m: float
    three_corner_distance_m: float
    free_throw_line_from_baseline_m: float
    restricted_radius_m: float


@dataclass(frozen=True)
class GameRules:
    period_count: int
    period_seconds: int
    shot_clock_seconds: int
    shot_clock_reset_off_reb_seconds: int
    shot_clock_reset_deadball_seconds: int
    backcourt_seconds: int
    foul_out: int
    timeouts_per_game: int
    timeouts_scheme: str
    timeouts_per_half_first: int
    timeouts_per_half_second: int
    timeouts_per_period: int
    timeouts_carryover: bool
    timeouts_per_ot: int
    inbound_seconds: int
    alt_possession: bool
    goaltending_enabled: bool
    defensive_three_seconds_enabled: bool


@dataclass(frozen=True)
class BonusRules:
    # Team fouls are counted per period. Thresholds are inclusive.
    # - one_and_one_threshold: if >0 and team_fouls >= threshold => 1-and-1
    # - double_bonus_threshold: if >0 and team_fouls >= threshold => 2 shots
    # - two_shots_threshold: if >0 and team_fouls >= threshold => 2 shots (no 1-and-1)
    one_and_one_threshold: int
    double_bonus_threshold: int
    two_shots_threshold: int
    # NBA-like: if >0, and within last2min_seconds of a period and team_fouls in that window reach threshold,
    # award 2 shots even if not yet in normal penalty.
    last2min_seconds: int
    last2min_two_shots_threshold: int


@dataclass(frozen=True)
class UniverseRules:
    id: str
    court: CourtRules
    game: GameRules
    bonus: BonusRules


def _rules_dir() -> Path:
    # backend/app/sim -> backend/app -> backend
    base = Path(__file__).resolve().parents[2]
    return base / "app" / "infra" / "rules" / "match_rules"


def _normalize_ruleset_id(ruleset: str | None) -> str:
    raw = str(ruleset or "FIBA").strip().lower()
    mapping = {
        "fiba": "fiba",
        "acb": "fiba",
        "primera_feb": "fiba",
        "nba": "nba",
        "wnba": "wnba",
        "ncaa_m": "ncaa_m",
        "ncaa men": "ncaa_m",
        "ncaa_w": "ncaa_w",
        "ncaa women": "ncaa_w",
    }
    return mapping.get(raw, raw)


def load_universe_rules(ruleset: str | None) -> UniverseRules:
    rid = _normalize_ruleset_id(ruleset)
    path = _rules_dir() / f"{rid}.json"
    if not path.exists():
        path = _rules_dir() / "fiba.json"
    data: Dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))

    court = data.get("court") or {}
    game = data.get("game") or {}
    bonus = data.get("bonus") or {}

    timeouts_scheme = str(game.get("timeouts_scheme") or game.get("timeoutsScheme") or "game").strip().lower()
    if timeouts_scheme not in {"game", "half", "period"}:
        timeouts_scheme = "game"

    tph = game.get("timeouts_per_half") if "timeouts_per_half" in game else game.get("timeoutsPerHalf")
    tph_first = None
    tph_second = None
    if isinstance(tph, list) and len(tph) >= 2:
        tph_first, tph_second = tph[0], tph[1]
    elif tph is not None:
        tph_first = tph_second = tph

    tpp = game.get("timeouts_per_period") if "timeouts_per_period" in game else game.get("timeoutsPerPeriod")

    court_rules = CourtRules(
        length_m=float(court.get("length_m") or 28.0),
        width_m=float(court.get("width_m") or 15.0),
        rim_x_from_baseline_m=float(court.get("rim_x_from_baseline_m") or 1.575),
        rim_height_m=float(court.get("rim_height_m") or 3.05),
        three_arc_radius_m=float(court.get("three_arc_radius_m") or 6.75),
        three_corner_distance_m=float(court.get("three_corner_distance_m") or 6.60),
        free_throw_line_from_baseline_m=float(court.get("free_throw_line_from_baseline_m") or 5.80),
        restricted_radius_m=float(court.get("restricted_radius_m") or 1.25),
    )
    game_rules = GameRules(
        period_count=int(game.get("period_count") or 4),
        period_seconds=int(game.get("period_seconds") or 600),
        shot_clock_seconds=int(game.get("shot_clock_seconds") or 24),
        shot_clock_reset_off_reb_seconds=int(game.get("shot_clock_reset_off_reb_seconds") or 14),
        shot_clock_reset_deadball_seconds=int(game.get("shot_clock_reset_deadball_seconds") or 0),
        backcourt_seconds=int(game.get("backcourt_seconds") or 8),
        foul_out=int(game.get("foul_out") or 5),
        timeouts_per_game=int(game.get("timeouts_per_game") or 5),
        timeouts_scheme=timeouts_scheme,
        timeouts_per_half_first=int(tph_first) if tph_first is not None else 0,
        timeouts_per_half_second=int(tph_second) if tph_second is not None else 0,
        timeouts_per_period=int(tpp) if tpp is not None else 0,
        timeouts_carryover=bool(game.get("timeouts_carryover") or game.get("timeoutsCarryover") or False),
        timeouts_per_ot=int(game.get("timeouts_per_ot") or 1),
        inbound_seconds=int(game.get("inbound_seconds") or game.get("inboundSeconds") or 5),
        alt_possession=bool(game.get("alt_possession") or game.get("altPossession") or True),
        goaltending_enabled=bool(game.get("goaltending_enabled") or game.get("goaltendingEnabled") or True),
        defensive_three_seconds_enabled=bool(
            game.get("defensive_three_seconds_enabled") or game.get("defensiveThreeSecondsEnabled") or False
        ),
    )
    two_thr = bonus.get("two_shots_threshold")
    bonus_rules = BonusRules(
        one_and_one_threshold=int(bonus.get("one_and_one_threshold") or 0),
        double_bonus_threshold=int(bonus.get("double_bonus_threshold") or 0),
        two_shots_threshold=int(two_thr) if two_thr is not None else 5,
        last2min_seconds=int(bonus.get("last2min_seconds") or 0),
        last2min_two_shots_threshold=int(bonus.get("last2min_two_shots_threshold") or 0),
    )
    return UniverseRules(id=str(data.get("id") or ruleset or "FIBA"), court=court_rules, game=game_rules, bonus=bonus_rules)
