from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

from .geometry import CourtGeom, Vec2, add, dist, mul, norm, sub
from .rules import UniverseRules, load_universe_rules


def _attr(player: Dict[str, Any], key: str, default: int = 500) -> int:
    try:
        return int((player.get("data") or {}).get("attrs", {}).get(key) or default)
    except Exception:
        return default


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _dist_point_segment(p: Vec2, a: Vec2, b: Vec2) -> float:
    # Distance from point p to segment ab (meters).
    ax, ay = a
    bx, by = b
    px, py = p
    abx, aby = bx - ax, by - ay
    apx, apy = px - ax, py - ay
    denom = (abx * abx) + (aby * aby)
    if denom <= 1e-9:
        return math.hypot(px - ax, py - ay)
    t = (apx * abx + apy * aby) / denom
    t = max(0.0, min(1.0, t))
    cx = ax + abx * t
    cy = ay + aby * t
    return math.hypot(px - cx, py - cy)


def _sigmoid(x: float) -> float:
    if x >= 12:
        return 0.999994
    if x <= -12:
        return 0.000006
    return 1.0 / (1.0 + math.exp(-x))


def _rating_to_prob(rating_0_1000: int, mid: int = 500, scale: float = 120.0) -> float:
    return _sigmoid((float(rating_0_1000) - float(mid)) / float(scale))


def _player_speed_mps(player: Dict[str, Any]) -> float:
    # 1..1000 mapped to ~3.5..7.2 m/s for a top-end sprint (very rough).
    v = (_attr(player, "speed_top", 500) + _attr(player, "acceleration", 500) + _attr(player, "agility_lat", 500)) / 3.0
    return 3.5 + (v / 1000.0) * 3.7


@dataclass
class PlayerState:
    id: int
    name: str
    team: str  # home|away
    slot: int  # 0..4 on-court
    pos: Vec2
    vel: Vec2
    energy: float  # 0..100
    fouls: int = 0


@dataclass
class BallState:
    pos: Vec2
    vel: Vec2
    holder: Optional[int]
    state: str  # live|pass|shot|dead|timeout


def _default_spots(court: CourtGeom, attack_right: bool) -> List[Vec2]:
    # 5-out-ish: top, wings, corners
    L, W = court.L, court.W
    rim_x, rim_y = court.rim(attack_right)
    top = (rim_x - (6.5 if attack_right else -6.5), W / 2.0)
    wing1 = (top[0], (W / 2.0) - 3.5)
    wing2 = (top[0], (W / 2.0) + 3.5)
    corner1 = (rim_x - (0.6 if attack_right else -0.6), 1.0)
    corner2 = (rim_x - (0.6 if attack_right else -0.6), W - 1.0)
    spots = [top, wing1, wing2, corner1, corner2]
    return [court.clamp_in_bounds(s, margin=0.4) for s in spots]


def _spots_by_spacing(court: CourtGeom, attack_right: bool, spacing: str | None) -> List[Vec2]:
    s = str(spacing or "").strip().lower()
    # Default is a 4-out 1-in-ish with corners + wings.
    L, W = court.L, court.W
    rim_x, _ = court.rim(attack_right)

    def clamp(spots: List[Vec2]) -> List[Vec2]:
        return [court.clamp_in_bounds(p, margin=0.4) for p in spots]

    # Helper coordinates around the rim side.
    top = (rim_x - (6.6 if attack_right else -6.6), W / 2.0)
    wing_low = (top[0], (W / 2.0) - 3.7)
    wing_high = (top[0], (W / 2.0) + 3.7)
    corner_low = (rim_x - (0.6 if attack_right else -0.6), 1.0)
    corner_high = (rim_x - (0.6 if attack_right else -0.6), W - 1.0)

    if "5-out" in s:
        # Everyone outside: wings a bit wider, corners deeper.
        corner_low = (rim_x - (0.5 if attack_right else -0.5), 0.8)
        corner_high = (rim_x - (0.5 if attack_right else -0.5), W - 0.8)
        wing_low = (top[0], (W / 2.0) - 4.2)
        wing_high = (top[0], (W / 2.0) + 4.2)
        return clamp([top, wing_low, wing_high, corner_low, corner_high])

    if "3-out" in s and "2-in" in s:
        # Two bigs inside (dunker spots / low post).
        block_dx = 2.1
        x_post = rim_x - (block_dx if attack_right else -block_dx)
        low = (x_post, (W / 2.0) - 1.4)
        high = (x_post, (W / 2.0) + 1.4)
        return clamp([top, wing_low, wing_high, low, high])

    if "horns" in s:
        # Two high posts near free throw line.
        ft_x = rim_x - (4.6 if attack_right else -4.6)
        p1 = (ft_x, (W / 2.0) - 1.6)
        p2 = (ft_x, (W / 2.0) + 1.6)
        return clamp([top, wing_low, wing_high, p1, p2])

    if "overload" in s:
        # Shift 3 players to a side.
        side = (W / 2.0) + 2.4
        s1 = (top[0], side)
        s2 = (rim_x - (1.0 if attack_right else -1.0), _clamp(side + 1.8, 0.8, W - 0.8))
        s3 = (rim_x - (2.4 if attack_right else -2.4), _clamp(side - 1.8, 0.8, W - 0.8))
        weak_corner = (rim_x - (0.6 if attack_right else -0.6), 1.0 if side > W / 2.0 else W - 1.0)
        return clamp([top, s1, s2, s3, weak_corner])

    # 4-out 1-in default: keep a big near dunker spot.
    x_big = rim_x - (2.4 if attack_right else -2.4)
    big = (x_big, W / 2.0)
    return clamp([top, wing_low, wing_high, corner_low, big])


def _bringup_spots(court: CourtGeom, attack_right: bool) -> List[Vec2]:
    # Backcourt alignment: get the handler up the floor before starting a half-court set.
    L, W = court.L, court.W
    half = L / 2.0
    # Keep all spots clearly in backcourt.
    x_top = (half - 4.5) if attack_right else (half + 4.5)
    top = (x_top, W / 2.0)
    wing1 = (x_top, (W / 2.0) - 3.2)
    wing2 = (x_top, (W / 2.0) + 3.2)
    # Outlet-ish lanes
    corner1 = (x_top - (1.6 if attack_right else -1.6), 1.4)
    corner2 = (x_top - (1.6 if attack_right else -1.6), W - 1.4)
    spots = [top, wing1, wing2, corner1, corner2]
    return [court.clamp_in_bounds(s, margin=0.6) for s in spots]


def _contest01(shooter: PlayerState, defender: PlayerState) -> float:
    d = dist(shooter.pos, defender.pos)
    # 0m => hard contest, 2.2m+ => mostly open
    return _clamp(1.0 - (d / 2.2), 0.0, 1.0)


def _shot_make_prob(
    rng: random.Random,
    court: CourtGeom,
    rules: UniverseRules,
    shooter_p: Dict[str, Any],
    shooter_s: PlayerState,
    defender_p: Dict[str, Any],
    defender_s: PlayerState,
    attack_right: bool,
    pressure: float,
    form: float,
) -> Tuple[bool, float, bool, float]:
    is_three = court.is_three(shooter_s.pos, attack_right)
    contest = _contest01(shooter_s, defender_s)
    fatigue01 = _clamp((100.0 - shooter_s.energy) / 100.0, 0.0, 1.0)

    if is_three:
        base = (_attr(shooter_p, "three_static", 500) + _attr(shooter_p, "contested_shot", 500)) / 2
    elif court.in_paint(shooter_s.pos, attack_right):
        base = (_attr(shooter_p, "finishing_close", 500) + _attr(shooter_p, "contact_finishing", 500)) / 2
    else:
        base = (_attr(shooter_p, "mid_range", 500) + _attr(shooter_p, "contested_shot", 500)) / 2

    defense = (_attr(defender_p, "shot_contest", 500) + _attr(defender_p, "def_perimeter", 500)) / 2
    contest_pen = contest * (0.35 + _rating_to_prob(int(defense), mid=520, scale=170) * 0.45)
    fatigue_pen = fatigue01 * 0.18

    p_make = _clamp(_rating_to_prob(int(base), mid=520, scale=150) - contest_pen - fatigue_pen, 0.02, 0.98)
    # Clutch + hot/cold form: small but noticeable.
    clutch = _attr(shooter_p, "clutch", 500)
    clutch01 = _rating_to_prob(int(clutch), mid=520, scale=180)
    p_make += (clutch01 - 0.5) * 0.06 * _clamp(pressure, 0.0, 1.0)
    p_make += 0.02 * _clamp(form, -1.0, 1.0)
    p_make = _clamp(p_make, 0.02, 0.98)

    made = rng.random() < p_make
    flight_s = 0.42 if is_three else 0.32
    return made, flight_s, is_three, float(p_make)


def simulate_match_mmp(
    home: List[Dict[str, Any]],
    away: List[Dict[str, Any]],
    *,
    seed: int | None = None,
    ruleset: str = "FIBA",
    tactics_home: Optional[Dict[str, Any]] = None,
    tactics_away: Optional[Dict[str, Any]] = None,
    playbook_home: Optional[Dict[str, Any]] = None,
    playbook_away: Optional[Dict[str, Any]] = None,
    rotation_home: Optional[Dict[str, Any]] = None,
    rotation_away: Optional[Dict[str, Any]] = None,
    ot_seconds: int | None = None,
    event_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    action_provider: Optional[Callable[[], List[Dict[str, Any]]]] = None,
    generate_positions: bool = False,
    position_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    period_count: int | None = None,
    period_seconds: int | None = None,
    tick_ms: int = 100,
) -> Dict[str, Any]:
    rng = random.Random(seed)
    rules = load_universe_rules(ruleset)
    # Allow override from payload (UI-driven)
    game_periods = int(period_count or rules.game.period_count)
    game_period_seconds = int(period_seconds or rules.game.period_seconds)

    court = CourtGeom(rules.court)

    dt_internal_ms = 20  # 50 Hz internal for movement/collisions
    dt_internal = float(dt_internal_ms) / 1000.0
    emit_every = max(0.05, float(tick_ms) / 1000.0)
    emit_acc = 0.0
    tick = 0

    reg_period_ms = int(game_period_seconds * 1000)
    reg_total_ms = int(game_periods * reg_period_ms)
    ot_ms = int((ot_seconds or 0) * 1000)
    ot_count = 0
    total_ms = int(reg_total_ms)
    clock_ms = int(total_ms)
    shot_clock_ms = int(rules.game.shot_clock_seconds * 1000)
    score = {"home": 0, "away": 0}
    poss = "home"
    attack_right = {"home": True, "away": False}
    team_ctx: Dict[str, Dict[str, Any]] = {
        "home": {"pace": 1.0, "off_focus": "Balance", "ptype": "Motion"},
        "away": {"pace": 1.0, "off_focus": "Balance", "ptype": "Motion"},
    }

    def apply_initial_tactics(team: str, tactics: Optional[Dict[str, Any]], playbook: Optional[Dict[str, Any]]) -> None:
        cfg = (tactics or {}).get("config") or {}
        team_ctx[team]["human"] = bool((tactics or {}).get("human"))
        try:
            pace_idx = int(cfg.get("pace")) if cfg.get("pace") is not None else None
        except Exception:
            pace_idx = None
        pace_map = {0: 0.82, 1: 0.92, 2: 1.00, 3: 1.10, 4: 1.26}
        if pace_idx is not None and pace_idx in pace_map:
            team_ctx[team]["pace"] = float(pace_map[pace_idx])

        focus_raw = str(cfg.get("focus") or "").strip()
        if focus_raw:
            low = focus_raw.lower()
            focus_map = {
                "equilibrado": "balance",
                "balance": "balance",
                "perimetro": "perimeter",
                "perímetro": "perimeter",
                "3pt": "perimeter",
                "poste bajo": "post",
                "post": "post",
                "pick & roll": "pnr",
                "pick and roll": "pnr",
                "pnr": "pnr",
                "aislamiento": "iso",
                "iso": "iso",
            }
            team_ctx[team]["off_focus"] = focus_map.get(low, focus_raw)

        defense_type = str(cfg.get("defenseType") or "Hombre a Hombre")
        team_ctx[team]["defense_type"] = defense_type
        team_ctx[team]["pnr_defense"] = str(cfg.get("pnrDefense") or "Drop")
        team_ctx[team]["post_defense"] = str(cfg.get("postDefense") or "1vs1")

        passing_risk = cfg.get("passingRisk")
        team_ctx[team]["passing_risk"] = int(passing_risk) if isinstance(passing_risk, int) else 1
        team_ctx[team]["aggression"] = float(cfg.get("aggression") or 50)
        team_ctx[team]["off_rebound"] = float(cfg.get("offRebound") or 30)
        team_ctx[team]["three_point"] = float(cfg.get("threePoint") or 50)
        team_ctx[team]["pnr_frequency"] = float(cfg.get("pnrFrequency") or 50)
        team_ctx[team]["freedom"] = int(cfg.get("freedom") or 1)
        team_ctx[team]["spacing"] = str(cfg.get("spacing") or "4-Out 1-In (Estandar)")
        team_ctx[team]["transition"] = int(cfg.get("transition") or 1)
        shot_profile = cfg.get("shotProfile") if "shotProfile" in cfg else cfg.get("shot_profile")
        if shot_profile is not None:
            team_ctx[team]["shot_profile"] = str(shot_profile)

        matchups = (tactics or {}).get("matchups") or {}
        if isinstance(matchups, dict) and matchups:
            # UI stores { attackerId: defenderId } for the human team. Keep as ints.
            team_ctx[team]["matchups"] = {int(k): int(v) for k, v in matchups.items() if v is not None}

        if playbook and isinstance(playbook, dict):
            pf = playbook.get("primaryFocus")
            pt = playbook.get("primaryType")
            if pf:
                team_ctx[team]["off_focus"] = str(pf)
            if pt:
                team_ctx[team]["ptype"] = str(pt)
            plays_in = playbook.get("plays")
            if isinstance(plays_in, list) and plays_in:
                norm: List[Dict[str, Any]] = []
                for pl in plays_in:
                    if not isinstance(pl, dict):
                        continue
                    eng = pl.get("engineData") if isinstance(pl.get("engineData"), dict) else {}
                    tags = eng.get("tags") if isinstance(eng.get("tags"), list) else []
                    ptype = pl.get("playType") or eng.get("play_type") or eng.get("playType")
                    frames = pl.get("frames") if isinstance(pl.get("frames"), list) else []
                    try:
                        fam = float(pl.get("familiarity") or 0.0)
                    except Exception:
                        fam = 0.0
                    try:
                        eff = float(pl.get("efficiency") or 50.0)
                    except Exception:
                        eff = 50.0
                    norm.append(
                        {
                            "id": str(pl.get("id") or ""),
                            "name": str(pl.get("name") or ""),
                            "playType": str(ptype or ""),
                            "engineData": eng,
                            "tags": [str(t) for t in tags if t is not None],
                            "frames": frames,
                            "familiarity": fam,
                            "efficiency": eff,
                        }
                    )
                if norm:
                    team_ctx[team]["plays"] = norm

    apply_initial_tactics("home", tactics_home, playbook_home)
    apply_initial_tactics("away", tactics_away, playbook_away)

    # Use the incoming roster order (the service can align it to UI lineup/bench).
    home_sorted = list(home)
    away_sorted = list(away)
    home_lineup = home_sorted[:5]
    away_lineup = away_sorted[:5]
    home_bench_players = home_sorted[5:12]
    away_bench_players = away_sorted[5:12]

    def init_states(team: str, lineup: List[Dict[str, Any]]) -> List[PlayerState]:
        spots = _bringup_spots(court, attack_right[team])
        out: List[PlayerState] = []
        for i, p in enumerate(lineup):
            pid = int(p["id"])
            out.append(
                PlayerState(
                    id=pid,
                    name=str(p.get("name") or f"Jugador {pid}"),
                    team=team,
                    slot=i,
                    pos=spots[i],
                    vel=(0.0, 0.0),
                    energy=100.0,
                )
            )
        return out

    home_on = init_states("home", home_lineup)
    away_on = init_states("away", away_lineup)

    # Bench states exist for energy recovery + substitutions (not rendered).
    def init_bench(team: str, bench: List[Dict[str, Any]]) -> List[PlayerState]:
        out: List[PlayerState] = []
        # Put them near their bench area
        targets = None
        for i, p in enumerate(bench):
            pid = int(p["id"])
            out.append(
                PlayerState(
                    id=pid,
                    name=str(p.get("name") or f"Jugador {pid}"),
                    team=team,
                    slot=int(i),
                    pos=(court.L * (0.16 if team == "home" else 0.84), court.W * (0.90 if team == "home" else 0.10)),
                    vel=(0.0, 0.0),
                    energy=100.0,
                )
            )
        return out

    home_bench = init_bench("home", home_bench_players)
    away_bench = init_bench("away", away_bench_players)

    by_id_player = {int(p["id"]): p for p in (home_lineup + away_lineup + home_bench_players + away_bench_players)}
    by_id_state = {s.id: s for s in (home_on + away_on + home_bench + away_bench)}

    def derive_role(p: Dict[str, Any]) -> str:
        # Lightweight archetype to drive "utility" decisions without requiring extra DB fields.
        pass_skill = (_attr(p, "passing", 500) + _attr(p, "vision", 500) + _attr(p, "pass_accuracy", 500)) / 3.0
        shoot3 = (_attr(p, "three_static", 500) + _attr(p, "off_screen_shot", 500)) / 2.0
        finish = (_attr(p, "finishing_close", 500) + _attr(p, "contact_finishing", 500)) / 2.0
        post = (_attr(p, "post_scoring", 500) + _attr(p, "hook_shot", 500) + _attr(p, "fadeaway", 500)) / 3.0
        pass01 = _rating_to_prob(int(pass_skill), mid=520, scale=170)
        shoot01 = _rating_to_prob(int(shoot3), mid=520, scale=170)
        fin01 = _rating_to_prob(int(finish), mid=520, scale=170)
        post01 = _rating_to_prob(int(post), mid=520, scale=170)
        if pass01 >= 0.68:
            return "creator"
        if post01 >= 0.66 and post01 >= fin01:
            return "post"
        if shoot01 >= 0.66 and shoot01 >= fin01:
            return "shooter"
        if fin01 >= 0.64:
            return "slasher"
        return "balanced"

    role_by_pid: Dict[int, str] = {int(pid): derive_role(p) for pid, p in by_id_player.items()}

    ball = BallState(pos=court.rim(False), vel=(0.0, 0.0), holder=None, state="live")

    # Minimal stats
    def stat_row(p: Dict[str, Any]) -> Dict[str, Any]:
        pid = int(p["id"])
        return {
            "player_id": pid,
            "name": p.get("name") or f"Jugador {pid}",
            "min": 0,
            "pts": 0,
            "reb": 0,
            "orb": 0,
            "drb": 0,
            "ast": 0,
            "stl": 0,
            "blk": 0,
            "fgm": 0,
            "fga": 0,
            "3pm": 0,
            "3pa": 0,
            "ftm": 0,
            "fta": 0,
            "tov": 0,
            "pf": 0,
            "pm": 0,
            "fg": "0/0",
            "tp": "0/0",
            "ft": "0/0",
            "ts": 0.0,
            "efg": 0.0,
        }

    stats = {
        "home": {int(p["id"]): stat_row(p) for p in (home_lineup + home_bench_players)},
        "away": {int(p["id"]): stat_row(p) for p in (away_lineup + away_bench_players)},
    }
    min_ms = {
        "home": {int(pid): 0 for pid in stats["home"].keys()},
        "away": {int(pid): 0 for pid in stats["away"].keys()},
    }
    min_period_ms: Dict[str, Dict[int, List[int]]] = {
        "home": {int(pid): [0 for _ in range(int(game_periods))] for pid in stats["home"].keys()},
        "away": {int(pid): [0 for _ in range(int(game_periods))] for pid in stats["away"].keys()},
    }

    def _parse_rotation(rot: Optional[Dict[str, Any]]) -> Dict[int, List[int]]:
        out: Dict[int, List[int]] = {}
        if not rot or not isinstance(rot, dict):
            return out
        players = rot.get("players") or []
        if not isinstance(players, list):
            return out
        for entry in players:
            if not isinstance(entry, dict):
                continue
            raw_pid = entry.get("playerId")
            if raw_pid is None:
                raw_pid = entry.get("player_id")
            if raw_pid is None:
                raw_pid = entry.get("id")
            try:
                pid = int(raw_pid)
            except Exception:
                continue
            periods = entry.get("periods")
            if not isinstance(periods, list):
                continue
            mins: List[int] = []
            for i in range(int(game_periods)):
                try:
                    mins.append(int(periods[i]) if i < len(periods) else 0)
                except Exception:
                    mins.append(0)
            out[pid] = mins
        return out

    rotation_targets_min: Dict[str, Dict[int, List[int]]] = {
        "home": _parse_rotation(rotation_home),
        "away": _parse_rotation(rotation_away),
    }
    on_court_ids = {
        "home": {ps.id for ps in home_on},
        "away": {ps.id for ps in away_on},
    }
    lineup_adv: Dict[str, Dict[Tuple[int, ...], Dict[str, Any]]] = {"home": {}, "away": {}}
    momentum: Dict[str, float] = {"home": 0.0, "away": 0.0}
    shot_chart: List[Dict[str, Any]] = []
    poss_time_ms: Dict[int, int] = {}
    form_by_pid: Dict[int, float] = {int(pid): 0.0 for pid in (list(stats["home"].keys()) + list(stats["away"].keys()))}
    poss_counts = {"home": 0, "away": 0}
    # Alternating possession arrow (FM-like: predictable rules for jump balls).
    alt_possession = bool(getattr(rules.game, "alt_possession", True))
    goaltending_enabled = bool(getattr(rules.game, "goaltending_enabled", True))
    defensive_three_seconds_enabled = bool(getattr(rules.game, "defensive_three_seconds_enabled", False))
    # Initial possession: random for all universes; arrow only matters when alt_possession is enabled.
    poss = "home" if rng.random() < 0.5 else "away"
    poss_counts[poss] = 1
    poss_arrow = "away" if poss == "home" else "home"
    team_fouls: Dict[str, List[int]] = {"home": [0 for _ in range(int(game_periods))], "away": [0 for _ in range(int(game_periods))]}
    team_fouls_l2m: Dict[str, List[int]] = {"home": [0 for _ in range(int(game_periods))], "away": [0 for _ in range(int(game_periods))]}

    shot: Optional[Dict[str, Any]] = None
    pass_state: Optional[Dict[str, Any]] = None
    last_pass: Optional[Dict[str, Any]] = None
    deadball_s = 0.0
    in_backcourt = True
    backcourt_elapsed_ms = 0
    ai_adjust_acc_ms = 0
    ai_sub_acc_ms = 0
    # Timeouts: support schemes (game/half/period) to match universes.
    timeouts_scheme = str(getattr(rules.game, "timeouts_scheme", "game") or "game").strip().lower()
    if timeouts_scheme not in ("game", "half", "period"):
        timeouts_scheme = "game"
    timeouts_per_half_first = int(getattr(rules.game, "timeouts_per_half_first", 0) or 0)
    timeouts_per_half_second = int(getattr(rules.game, "timeouts_per_half_second", 0) or 0)
    timeouts_per_period = int(getattr(rules.game, "timeouts_per_period", 0) or 0)
    timeouts_carryover = bool(getattr(rules.game, "timeouts_carryover", False))

    def half_idx(pi: int) -> int:
        # Split regular periods into halves; OT periods are treated as "second half".
        try:
            half_len = max(1, int(game_periods) // 2)
        except Exception:
            half_len = 2
        return 0 if int(pi) < int(half_len) else 1

    def init_timeouts_for_half(hidx: int) -> int:
        if int(hidx) <= 0:
            return int(timeouts_per_half_first or 0)
        return int(timeouts_per_half_second or timeouts_per_half_first or 0)

    def init_timeouts(pi: int) -> int:
        if timeouts_scheme == "period" and timeouts_per_period > 0:
            return int(timeouts_per_period)
        if timeouts_scheme == "half":
            base = init_timeouts_for_half(half_idx(int(pi)))
            if base > 0:
                return int(base)
        return int(rules.game.timeouts_per_game or 0)

    timeouts_left = {"home": int(init_timeouts(0)), "away": int(init_timeouts(0))}
    inbound_state: Optional[Dict[str, Any]] = None
    paint_ms: Dict[int, int] = {}
    def_paint_ms: Dict[int, int] = {}
    pending_subs: Dict[str, List[Tuple[int, int]]] = {"home": [], "away": []}
    manual_sub_lock_ms: Dict[str, Dict[int, int]] = {"home": {}, "away": {}}
    manual_sub_lock_duration_ms = 90_000
    rotation_cooldown_until_ms: Dict[str, int] = {"home": 0, "away": 0}

    def sim_elapsed_ms() -> int:
        return int(total_ms - clock_ms)

    def is_manual_locked(team: str, pid: int) -> bool:
        try:
            return int(manual_sub_lock_ms.get(team, {}).get(int(pid)) or 0) > int(sim_elapsed_ms())
        except Exception:
            return False

    # Playbook/ATO layer (lightweight): applies short-lived tactical modifiers after inbounds/timeouts.
    play_active: Dict[str, Dict[str, Any]] = {
        "home": {"until_ms": 0, "ctx": None, "pass_add": 0.0, "shot_add": 0.0, "tov_mult": 1.0},
        "away": {"until_ms": 0, "ctx": None, "pass_add": 0.0, "shot_add": 0.0, "tov_mult": 1.0},
    }

    def current_play_mod(team: str) -> Dict[str, Any]:
        m = play_active.get(team) or {}
        if int(m.get("until_ms") or 0) > int(sim_elapsed_ms()):
            return m
        return {"until_ms": 0, "ctx": None, "pass_add": 0.0, "shot_add": 0.0, "tov_mult": 1.0}

    def _tag_has(tags: List[str], needle: str) -> bool:
        n = str(needle or "").strip().lower()
        if not n:
            return False
        return any(str(t or "").strip().lower() == n for t in (tags or []))

    def _svg_pt_to_court(pt: Dict[str, Any], team: str) -> Vec2:
        try:
            sx = float(pt.get("x") or 0.0)
            sy = float(pt.get("y") or 0.0)
        except Exception:
            sx, sy = 0.0, 0.0
        # TacticsCreatorAdvanced uses viewBox 0..500 (x) and 0..470 (y) for a half-court:
        # y=0 is baseline, y=470 is midcourt. Convert to CourtGeom meters.
        half_len = float(court.L) / 2.0
        dist_from_baseline = _clamp(sy / 470.0, 0.0, 1.0) * half_len
        if bool(attack_right.get(team, True)):
            x = float(court.L) - dist_from_baseline
        else:
            x = dist_from_baseline
        y = _clamp(sx / 500.0, 0.0, 1.0) * float(court.W)
        return court.clamp_in_bounds((x, y), margin=0.45)

    def _nearest_token_id(players: List[Dict[str, Any]], pt: Dict[str, Any]) -> Optional[int]:
        if not players:
            return None
        try:
            tx = float(pt.get("x") or 0.0)
            ty = float(pt.get("y") or 0.0)
        except Exception:
            return None
        best = 1e9
        best_id: Optional[int] = None
        for pl in players:
            try:
                px = float(pl.get("x") or 0.0)
                py = float(pl.get("y") or 0.0)
                d = math.hypot(px - tx, py - ty)
                if d < best:
                    best = d
                    best_id = int(pl.get("id") or 0) or None
            except Exception:
                continue
        return best_id

    def _extract_play_keyframes(team: str, play: Dict[str, Any]) -> Tuple[List[List[Vec2]], List[Tuple[int, int]]]:
        frames = play.get("frames") if isinstance(play.get("frames"), list) else []
        spacing = str(team_ctx.get(team, {}).get("spacing") or "")
        base = _spots_by_spacing(court, bool(attack_right.get(team, True)), spacing)
        keyframes: List[List[Vec2]] = []
        pass_seq: List[Tuple[int, int]] = []
        for fr in frames[:6]:
            if not isinstance(fr, dict):
                continue
            pls = fr.get("players") if isinstance(fr.get("players"), list) else []
            targets: List[Optional[Vec2]] = [None, None, None, None, None]
            for pl in pls:
                if not isinstance(pl, dict):
                    continue
                try:
                    tid = int(pl.get("id") or 0)
                except Exception:
                    tid = 0
                if 1 <= tid <= 5:
                    targets[tid - 1] = _svg_pt_to_court(pl, team)
            out = [targets[i] if targets[i] is not None else base[i] for i in range(5)]
            keyframes.append(out)

            paths = fr.get("paths") if isinstance(fr.get("paths"), list) else []
            for pa in paths:
                if not isinstance(pa, dict):
                    continue
                if str(pa.get("type") or "") != "pass":
                    continue
                pts = pa.get("points") if isinstance(pa.get("points"), list) else []
                if len(pts) < 2:
                    continue
                start_pt = pts[0] if isinstance(pts[0], dict) else {}
                end_pt = pts[-1] if isinstance(pts[-1], dict) else {}
                from_id = None
                try:
                    from_id = int(pa.get("linkedId") or 0) or None
                except Exception:
                    from_id = None
                if from_id is None:
                    try:
                        from_id = int(fr.get("ballOwnerId") or 0) or None
                    except Exception:
                        from_id = None
                if from_id is None:
                    from_id = _nearest_token_id(pls, start_pt)
                to_id = _nearest_token_id(pls, end_pt)
                if from_id and to_id and 1 <= int(from_id) <= 5 and 1 <= int(to_id) <= 5:
                    pass_seq.append((int(from_id) - 1, int(to_id) - 1))
        # Keep it short; this is guidance, not a script.
        return keyframes, pass_seq[:5]

    def _advance_play_step(team: str, from_id: int, to_id: int) -> None:
        try:
            pm = play_active.get(team) or {}
            if int(pm.get("until_ms") or 0) <= int(sim_elapsed_ms()):
                return
            seq = pm.get("pass_seq")
            if not isinstance(seq, list) or not seq:
                return
            step = int(pm.get("pass_step") or 0)
            if step >= len(seq):
                return
            frm = by_id_state.get(int(from_id))
            to = by_id_state.get(int(to_id))
            if frm is None or to is None:
                return
            want = seq[step]
            if not isinstance(want, (list, tuple)) or len(want) != 2:
                return
            if int(frm.slot) == int(want[0]) and int(to.slot) == int(want[1]):
                pm["pass_step"] = int(step + 1)
                # If the action completed, lean slightly towards a shot.
                if int(pm["pass_step"]) >= len(seq):
                    pm["shot_add"] = float(pm.get("shot_add") or 0.0) + 0.03
                play_active[team] = pm
        except Exception:
            return

    def choose_play_for_ctx(team: str, ctx: str) -> Optional[Dict[str, Any]]:
        plays = team_ctx.get(team, {}).get("plays")
        if not isinstance(plays, list) or not plays:
            return None
        ctx_up = str(ctx or "").strip().upper()
        focus = str(team_ctx.get(team, {}).get("off_focus") or "").strip().lower()
        ptype = str(team_ctx.get(team, {}).get("ptype") or "").strip().lower()

        def score(pl: Dict[str, Any]) -> float:
            tags = pl.get("tags") or []
            eng = pl.get("engineData") or {}
            s = 1.0
            play_type = str(pl.get("playType") or eng.get("play_type") or "").strip().upper()
            if ctx_up in ("ATO", "BLOB", "SLOB", "EOQ"):
                if play_type == "ATO":
                    s += 0.9
                if _tag_has(tags, "ato"):
                    s += 0.6
                if ctx_up in ("BLOB", "SLOB") and _tag_has(tags, ctx_up.lower()):
                    s += 0.9
                if ctx_up == "EOQ" and (_tag_has(tags, "eoq") or _tag_has(tags, "clock")):
                    s += 0.8
            if "per" in focus or "3" in focus or focus in ("3pt", "perimeter"):
                if _tag_has(tags, "3pt") or _tag_has(tags, "corner-3"):
                    s += 0.5
            if focus in ("post", "poste", "poste bajo"):
                if _tag_has(tags, "post") or _tag_has(tags, "high-low"):
                    s += 0.5
            if focus in ("pnr", "pick & roll", "pick and roll"):
                if _tag_has(tags, "pnr"):
                    s += 0.5
            if ptype == "flow":
                if play_type == "FLOW" or _tag_has(tags, "flow"):
                    s += 0.3
            if ptype == "motion":
                if _tag_has(tags, "half-court") or _tag_has(tags, "reads:3+"):
                    s += 0.1
            # prefer familiar/efficient, but keep some randomness
            try:
                fam = float(pl.get("familiarity") or 0.0)
            except Exception:
                fam = 0.0
            try:
                eff = float(pl.get("efficiency") or 50.0)
            except Exception:
                eff = 50.0
            s += (fam / 100.0) * 0.35
            s += ((eff - 50.0) / 100.0) * 0.2
            s += rng.random() * 0.15
            return max(0.01, float(s))

        scored = [(score(pl), pl) for pl in plays if isinstance(pl, dict)]
        if not scored:
            return None
        scored.sort(key=lambda x: x[0], reverse=True)
        # Softmax-ish top-k pick to avoid calling the same play every time.
        top = scored[: min(6, len(scored))]
        total = sum(w for w, _ in top)
        r = rng.random() * total
        acc = 0.0
        for w, pl in top:
            acc += w
            if r <= acc:
                return pl
        return top[0][1]

    def activate_play(team: str, ctx: str, *, reason: str, loc: str) -> None:
        ctx = str(ctx or "").strip()
        if not ctx:
            return
        # Duration roughly matches a half-court action.
        until_ms = int(sim_elapsed_ms()) + 14_000
        pass_add = 0.0
        shot_add = 0.0
        tov_mult = 1.0
        chosen = choose_play_for_ctx(team, ctx)
        chosen_id = ""
        chosen_name = ""
        chosen_type = ""
        chosen_tags: List[str] = []
        chosen_why: Dict[str, Any] = {}
        chosen_keyframes: List[List[Vec2]] = []
        chosen_pass_seq: List[Tuple[int, int]] = []
        if chosen:
            chosen_id = str(chosen.get("id") or "")
            chosen_name = str(chosen.get("name") or "")
            chosen_type = str(chosen.get("playType") or "")
            chosen_tags = list(chosen.get("tags") or [])
            eng = chosen.get("engineData") or {}
            stats = eng.get("stats") if isinstance(eng.get("stats"), dict) else {}
            screens = int(stats.get("screens") or 0)
            passes = int(stats.get("passes") or 0)
            moves = int(stats.get("moves") or 0)
            chosen_why = {
                "play_id": chosen_id,
                "play_type": chosen_type,
                "screens": screens,
                "passes": passes,
                "moves": moves,
                "familiarity": float(chosen.get("familiarity") or 0.0),
                "efficiency": float(chosen.get("efficiency") or 50.0),
            }
            chosen_keyframes, chosen_pass_seq = _extract_play_keyframes(team, chosen)
            # Base modifiers: very light-touch so the match stays "free".
            pass_add += 0.01 * min(6, passes)
            shot_add += 0.012 * min(4, screens)
            tov_mult *= 0.98
            if _tag_has(chosen_tags, "3pt") or _tag_has(chosen_tags, "corner-3"):
                shot_add += 0.03
            if _tag_has(chosen_tags, "pnr"):
                pass_add += 0.03
            if _tag_has(chosen_tags, "post") or _tag_has(chosen_tags, "high-low"):
                shot_add += 0.01
            # Complexity penalty when unfamiliar (more realistic: sloppy execution early season).
            fam = float(chosen.get("familiarity") or 0.0)
            complexity = (0.7 * screens) + (0.35 * passes) + (0.2 * moves)
            if fam < 25 and complexity >= 3.5:
                tov_mult *= 1.06
            elif fam > 65 and complexity >= 3.5:
                tov_mult *= 0.95

        low = ctx.lower()
        ctx_pass_add = 0.0
        ctx_shot_add = 0.0
        ctx_tov_mult = 1.0
        if low == "ato":
            ctx_pass_add = 0.08
            ctx_shot_add = 0.04
            ctx_tov_mult = 0.92
        elif low in ("slob", "blob"):
            ctx_pass_add = 0.06
            ctx_shot_add = 0.03
            ctx_tov_mult = 0.95
        elif low == "eoq":
            ctx_pass_add = -0.04
            ctx_shot_add = 0.06
            ctx_tov_mult = 1.02
        elif low == "quick":
            ctx_pass_add = 0.02
            ctx_shot_add = 0.03
            ctx_tov_mult = 0.97
        else:  # "set" / default
            ctx_pass_add = 0.04
            ctx_shot_add = 0.02
            ctx_tov_mult = 0.97

        pass_add += float(ctx_pass_add)
        shot_add += float(ctx_shot_add)
        tov_mult *= float(ctx_tov_mult)

        play_active[team] = {
            "until_ms": until_ms,
            "started_ms": int(sim_elapsed_ms()),
            "stage_ms": int(max(800, min(2600, (until_ms - int(sim_elapsed_ms())) // max(1, len(chosen_keyframes) or 1)))),
            "ctx": ctx,
            "pass_add": float(pass_add),
            "shot_add": float(shot_add),
            "tov_mult": float(tov_mult),
            "play_id": chosen_id,
            "play_name": chosen_name,
            "play_type": chosen_type,
            "kf": chosen_keyframes,
            "pass_seq": chosen_pass_seq,
            "pass_step": 0,
        }
        # Emit for explainability/UI (FM-style: show what was called and why).
        try:
            log(
                {
                    "clock": clock_s(),
                    "event": "play_called",
                    "team": team,
                    "ctx": ctx,
                    "reason": str(reason),
                    "loc": str(loc),
                    "focus": str(team_ctx.get(team, {}).get("off_focus") or ""),
                    "ptype": str(team_ctx.get(team, {}).get("ptype") or ""),
                    "play_id": chosen_id,
                    "play_name": chosen_name,
                    "play_type": chosen_type,
                    "tags": chosen_tags,
                    "why": chosen_why,
                    "force_emit": True,
                }
            )
        except Exception:
            pass

    def update_efficiency(row: Dict[str, Any]) -> None:
        fgm = int(row.get("fgm") or 0)
        fga = int(row.get("fga") or 0)
        tpm = int(row.get("3pm") or 0)
        tpa = int(row.get("3pa") or 0)
        ftm = int(row.get("ftm") or 0)
        fta = int(row.get("fta") or 0)
        pts = int(row.get("pts") or 0)
        row["fg"] = f"{fgm}/{fga}"
        row["tp"] = f"{tpm}/{tpa}"
        row["ft"] = f"{ftm}/{fta}"
        row["efg"] = round(((fgm + 0.5 * tpm) / fga) * 100, 1) if fga else 0.0
        denom = 2.0 * (float(fga) + 0.44 * float(fta))
        row["ts"] = round((pts / denom) * 100, 1) if denom else 0.0

    def clock_s() -> float:
        return float(clock_ms) / 1000.0

    def shot_clock_s() -> float:
        return float(shot_clock_ms) / 1000.0

    def period_state() -> Tuple[int, int, int, str]:
        """Return (overall_period_index, remaining_ms_in_period, period_len_ms, phase)."""
        elapsed_ms = int(total_ms - clock_ms)
        if elapsed_ms < int(reg_total_ms):
            idx = int(elapsed_ms // max(1, int(reg_period_ms)))
            into = int(elapsed_ms - idx * int(reg_period_ms))
            rem = int(max(0, min(int(reg_period_ms), int(reg_period_ms) - into)))
            return idx, rem, int(reg_period_ms), "reg"
        if ot_ms <= 0:
            return int(game_periods - 1), 0, int(reg_period_ms), "reg"
        ot_elapsed = int(elapsed_ms - int(reg_total_ms))
        ot_idx = int(ot_elapsed // max(1, int(ot_ms)))
        into = int(ot_elapsed - ot_idx * int(ot_ms))
        rem = int(max(0, min(int(ot_ms), int(ot_ms) - into)))
        return int(game_periods + ot_idx), rem, int(ot_ms), "ot"

    def period_idx() -> int:
        return int(period_state()[0])

    def period_remaining_ms() -> int:
        return int(period_state()[1])

    # Period accounting (needs period_idx/clock_s defined above).
    last_pi = int(period_idx())
    last_half = int(half_idx(last_pi))
    period_start_score = {"home": int(score["home"]), "away": int(score["away"])}
    score_by_period: List[Dict[str, int]] = []

    def close_period(pi_closed: int) -> None:
        nonlocal period_start_score, score_by_period
        # Period end event (for play-by-play / narrative).
        try:
            log(
                {
                    "clock": clock_s(),
                    "event": "period_end",
                    "pi": int(pi_closed),
                    "score": {"home": int(score["home"]), "away": int(score["away"])},
                    "force_emit": True,
                }
            )
        except Exception:
            pass
        score_by_period.append(
            {
                "pi": int(pi_closed),
                "home": int(score["home"]) - int(period_start_score["home"]),
                "away": int(score["away"]) - int(period_start_score["away"]),
            }
        )
        period_start_score = {"home": int(score["home"]), "away": int(score["away"])}

    def foul_bonus_kind(def_team: str, *, period_fouls_after: int) -> str:
        b = rules.bonus
        pi = period_idx()
        # NBA-like last-2-min rule (approx): if not yet in normal penalty, 2nd foul in last 2 minutes => 2 shots.
        if int(b.last2min_seconds or 0) > 0 and int(b.last2min_two_shots_threshold or 0) > 0:
            if period_remaining_ms() <= int(b.last2min_seconds) * 1000:
                if int(b.two_shots_threshold or 0) <= 0 or int(period_fouls_after) < int(b.two_shots_threshold):
                    if int(team_fouls_l2m[def_team][pi] or 0) >= int(b.last2min_two_shots_threshold):
                        return "double"
        if int(b.double_bonus_threshold or 0) > 0 and int(period_fouls_after) >= int(b.double_bonus_threshold):
            return "double"
        if int(b.one_and_one_threshold or 0) > 0 and int(period_fouls_after) >= int(b.one_and_one_threshold):
            return "one_and_one"
        if int(b.two_shots_threshold or 0) > 0 and int(period_fouls_after) >= int(b.two_shots_threshold):
            return "double"
        return "none"

    def add_plus_minus(scoring_team: str, pts: int) -> None:
        if pts <= 0:
            return
        other = "away" if scoring_team == "home" else "home"
        for pid in on_court_ids.get(scoring_team, set()):
            row = stats.get(scoring_team, {}).get(int(pid))
            if row is not None:
                row["pm"] = int(row.get("pm") or 0) + int(pts)
        for pid in on_court_ids.get(other, set()):
            row = stats.get(other, {}).get(int(pid))
            if row is not None:
                row["pm"] = int(row.get("pm") or 0) - int(pts)

    def _lineup_key(team: str) -> Tuple[int, ...]:
        ids = list(on_court_ids.get(team, set()) or [])
        ids.sort()
        return tuple(int(x) for x in ids)

    def _lineup_tick(team: str, dt_ms: int) -> None:
        key = _lineup_key(team)
        if len(key) < 5:
            return
        row = lineup_adv[team].setdefault(key, {"ids": key, "ms": 0, "pts_for": 0, "pts_against": 0})
        row["ms"] = int(row.get("ms") or 0) + int(dt_ms)

    def _lineup_add_points(scoring_team: str, pts: int) -> None:
        if pts <= 0:
            return
        other = "away" if scoring_team == "home" else "home"
        sk = _lineup_key(scoring_team)
        ok = _lineup_key(other)
        if len(sk) >= 5:
            row = lineup_adv[scoring_team].setdefault(sk, {"ids": sk, "ms": 0, "pts_for": 0, "pts_against": 0})
            row["pts_for"] = int(row.get("pts_for") or 0) + int(pts)
        if len(ok) >= 5:
            row = lineup_adv[other].setdefault(ok, {"ids": ok, "ms": 0, "pts_for": 0, "pts_against": 0})
            row["pts_against"] = int(row.get("pts_against") or 0) + int(pts)

    def _bump_momentum(scoring_team: str, pts: int) -> None:
        other = "away" if scoring_team == "home" else "home"
        bump = 0.10 + 0.04 * _clamp(float(pts), 0.0, 3.0)
        momentum[scoring_team] = float(_clamp(float(momentum.get(scoring_team, 0.0)) + bump, -1.0, 1.0))
        momentum[other] = float(_clamp(float(momentum.get(other, 0.0)) - bump * 0.65, -1.0, 1.0))

    def add_points(scoring_team: str, pts: int) -> None:
        if pts <= 0:
            return
        score[scoring_team] += int(pts)
        add_plus_minus(scoring_team, int(pts))
        _lineup_add_points(scoring_team, int(pts))
        _bump_momentum(scoring_team, int(pts))

    def log(evt: Dict[str, Any]) -> None:
        if event_callback:
            event_callback(evt)

    def emit_tick() -> None:
        if not generate_positions or not position_callback:
            return
        # Allow the host (match_service) to temporarily disable positional ticks during fast-forward.
        try:
            if bool(getattr(position_callback, "skip_positions", False)):
                return
        except Exception:
            pass
        # UI expects 10 players: 5 home then 5 away: [x,y,hasBall,actionFlag]
        # CourtCanvas uses 0..100 normalised coordinates.
        def nx(p: Vec2) -> float:
            return (float(p[0]) / float(court.L)) * 100.0

        def ny(p: Vec2) -> float:
            return (float(p[1]) / float(court.W)) * 100.0

        players10: List[List[Any]] = []
        for s in home_on:
            players10.append([nx(s.pos), ny(s.pos), 1 if ball.holder == s.id else 0, "m", int(round(float(s.energy)))])
        for s in away_on:
            players10.append([nx(s.pos), ny(s.pos), 1 if ball.holder == s.id else 0, "m", int(round(float(s.energy)))])

        pi = period_idx()
        hf_list = team_fouls.get("home") or []
        af_list = team_fouls.get("away") or []
        hf = int(hf_list[pi]) if int(pi) < len(hf_list) else 0
        af = int(af_list[pi]) if int(pi) < len(af_list) else 0
        # Bonus/penalty state (from the offensive team's perspective).
        home_pen = foul_bonus_kind("away", period_fouls_after=int(af))
        away_pen = foul_bonus_kind("home", period_fouls_after=int(hf))
        bc_left = 0.0
        if in_backcourt:
            try:
                bc_left = max(0.0, float(rules.game.backcourt_seconds) - (float(backcourt_elapsed_ms) / 1000.0))
            except Exception:
                bc_left = 0.0
        position_callback(
            {
                "t": tick,
                "c": clock_s(),
                "sc": shot_clock_s(),
                "pi": int(pi),
                "pr": float(period_remaining_ms()) / 1000.0,
                "ap": str(poss_arrow),
                "bc": float(bc_left),
                "pen": {"home": str(home_pen), "away": str(away_pen)},
                "tf": {"home": int(hf), "away": int(af)},
                "tl": {"home": int(timeouts_left.get("home") or 0), "away": int(timeouts_left.get("away") or 0)},
                "b": {"x": nx(ball.pos), "y": ny(ball.pos), "h": ball.holder, "s": ball.state},
                "p": players10,
            }
        )

    def pick_ballhandler(team: str) -> PlayerState:
        # slot 0 is handler by default
        roster = home_on if team == "home" else away_on
        return roster[0]

    def pick_inbounder(team: str) -> PlayerState:
        roster = home_on if team == "home" else away_on
        return roster[4] if len(roster) >= 5 else roster[0]

    def nearest_defender(shooter: PlayerState) -> PlayerState:
        roster = away_on if shooter.team == "home" else home_on
        return min(roster, key=lambda d: dist(d.pos, shooter.pos))

    def inbound_spot(team: str, loc: str) -> Vec2:
        # Keep in-bounds (CourtCanvas can't render outside court).
        loc = str(loc or "backcourt").lower()
        ar = bool(attack_right[team])
        if loc == "frontcourt":
            # Sideline inbound in the frontcourt.
            x = (court.L - 6.0) if ar else 6.0
            y = 0.6
            return court.clamp_in_bounds((x, y), margin=0.35)
        # Backcourt baseline inbound.
        x = 0.35 if ar else (court.L - 0.35)
        return court.clamp_in_bounds((x, court.W / 2.0), margin=0.35)

    def start_inbound(team: str, *, duration_s: float = 1.1, reason: str = "inbound", loc: str = "backcourt") -> None:
        nonlocal deadball_s, inbound_state, in_backcourt, backcourt_elapsed_ms, last_pass, pass_state
        duration_s = float(_clamp(float(duration_s), 0.4, 6.0))
        deadball_s = max(deadball_s, duration_s)
        inbounder = pick_inbounder(team)
        receiver = pick_ballhandler(team)
        ball.state = "dead"
        ball.holder = inbounder.id
        ball.pos = inbound_spot(team, loc)
        inbound_state = {
            "team": team,
            "from_id": inbounder.id,
            "to_id": receiver.id,
            "reason": reason,
            "loc": str(loc),
            "elapsed_ms": 0,
            "limit_ms": int(getattr(rules.game, "inbound_seconds", 5) or 5) * 1000,
        }
        pass_state = None
        last_pass = None
        in_backcourt = str(loc).lower() != "frontcourt"
        backcourt_elapsed_ms = 0
        # Auto-call a lightweight play context on key stoppages.
        try:
            r = str(reason or "").lower()
            ctx = None
            if "timeout" in r:
                ctx = "ATO"
            elif "sideout" in r:
                ctx = "SLOB"
            elif "after_score" in r:
                ctx = "Quick"
            elif "period_start" in r:
                ctx = "Set"
            if ctx and r not in ("tipoff",):
                activate_play(team, ctx, reason=str(reason), loc=str(loc))
        except Exception:
            pass

    # Tip-off / start of game: dead-ball inbound with alternating possession arrow.
    log({"clock": clock_s(), "event": "jump_ball", "possession": poss, "arrow": poss_arrow, "force_emit": True})
    start_inbound(poss, reason="tipoff", loc="backcourt", duration_s=3.5)

    def _matchup_defender_id(def_team: str, attacker_id: int) -> Optional[int]:
        m = (team_ctx.get(def_team, {}) or {}).get("matchups") or {}
        if not isinstance(m, dict):
            return None
        try:
            did = m.get(int(attacker_id))
            return int(did) if did is not None else None
        except Exception:
            return None

    def primary_defender(attacker: PlayerState, def_team: str) -> PlayerState:
        did = _matchup_defender_id(def_team, attacker.id)
        if did is not None:
            ds = by_id_state.get(int(did))
            if ds is not None and ds.team == def_team and ds.id in on_court_ids.get(def_team, set()):
                return ds
        return nearest_defender(attacker)

    def apply_actions() -> None:
        nonlocal deadball_s
        if not action_provider:
            return
        actions = action_provider() or []
        for a in actions:
            at = str(a.get("action") or "").lower()
            if at == "timeout":
                team = str(a.get("team") or poss).lower()
                team = "home" if team != "away" else "away"
                kind = str(a.get("timeout_kind") or "team")
                if int(timeouts_left.get(team, 0) or 0) <= 0:
                    log({"clock": clock_s(), "event": "timeout_denied", "team": team, "timeout_kind": kind})
                    continue
                timeouts_left[team] = int(timeouts_left.get(team, 0) or 0) - 1
                # Represent bench huddle: keep clock stopped but add a short visual pause.
                deadball_s = max(deadball_s, 4.0 if kind in ("full", "media") else 2.0)
                ball.state = "timeout"
                log(
                    {
                        "clock": clock_s(),
                        "event": "timeout",
                        "team": team,
                        "timeout_kind": kind,
                        "pause": True,
                        "remaining": int(timeouts_left.get(team, 0) or 0),
                    }
                )
            elif at == "substitution":
                team = str(a.get("team") or poss).lower()
                team = "home" if team != "away" else "away"
                out_id = a.get("out_id")
                in_id = a.get("in_id")
                if not out_id or not in_id:
                    continue
                out_id = int(out_id)
                in_id = int(in_id)
                # Manual subs: protect from immediate auto-rotation swaps (avoid oscillations).
                lock_until = int(sim_elapsed_ms()) + int(manual_sub_lock_duration_ms)
                manual_sub_lock_ms.setdefault(team, {})[int(out_id)] = lock_until
                manual_sub_lock_ms.setdefault(team, {})[int(in_id)] = lock_until
                # Substitutions happen on stoppages. Queue if requested during live play.
                if ball.state == "live" and deadball_s <= 0.0:
                    existing = pending_subs.get(team) or []
                    pending_subs[team] = [(o, i) for (o, i) in existing if int(o) != int(out_id)] + [(out_id, in_id)]
                    log({"clock": clock_s(), "event": "substitution_queued", "team": team, "out_id": out_id, "in_id": in_id})
                    continue
                on = home_on if team == "home" else away_on
                bench = home_bench if team == "home" else away_bench
                out_idx = next((i for i, ps in enumerate(on) if ps.id == out_id), None)
                in_idx = next((i for i, ps in enumerate(bench) if ps.id == in_id), None)
                if out_idx is None or in_idx is None:
                    continue
                out_ps = on[out_idx]
                in_ps = bench[in_idx]
                # Swap: incoming takes the slot + location; outgoing goes to bench
                in_ps.slot = out_ps.slot
                in_ps.pos = out_ps.pos
                in_ps.vel = (0.0, 0.0)
                out_ps.slot = in_ps.slot
                out_ps.vel = (0.0, 0.0)
                on[out_idx] = in_ps
                bench[in_idx] = out_ps
                # Update state map
                by_id_state[in_ps.id] = in_ps
                by_id_state[out_ps.id] = out_ps
                on_court_ids[team] = {ps.id for ps in on}
                if ball.holder == out_ps.id:
                    ball.holder = in_ps.id
                log({"clock": clock_s(), "event": "substitution", "team": team, "out": out_ps.name, "in": in_ps.name, "out_id": out_id, "in_id": in_id, "reason": "manual"})
            elif at == "shout":
                team = str(a.get("team") or poss).lower()
                team = "home" if team != "away" else "away"
                label = str(a.get("label") or "Intensidad")
                low = label.strip().lower()
                if low in ("ritmo alto", "tempo", "push"):
                    team_ctx[team]["pace"] = float(_clamp(float(team_ctx[team].get("pace") or 1.0) + 0.15, 0.7, 1.35))
                elif low in ("calma", "slow", "stall"):
                    team_ctx[team]["pace"] = float(_clamp(float(team_ctx[team].get("pace") or 1.0) - 0.15, 0.7, 1.35))
                elif low in ("ataque", "attack"):
                    team_ctx[team]["off_focus"] = "Attack"
                elif low in ("defensa", "defense"):
                    team_ctx[team]["off_focus"] = "Defense"
                else:
                    # Intensidad = small pace bump
                    team_ctx[team]["pace"] = float(_clamp(float(team_ctx[team].get("pace") or 1.0) + 0.05, 0.7, 1.35))
                log({"clock": clock_s(), "event": "shout", "team": team, "label": label})
            elif at == "playbook_change":
                team = str(a.get("team") or poss).lower()
                team = "home" if team != "away" else "away"
                label = str(a.get("label") or "Playbook")
                focus = str(a.get("focus") or a.get("label") or "Balance")
                ptype = str(a.get("ptype") or "Motion")
                team_ctx[team]["off_focus"] = focus
                team_ctx[team]["ptype"] = ptype
                log({"clock": clock_s(), "event": "playbook_change", "team": team, "label": label})
            elif at == "tactics_change":
                team = str(a.get("team") or poss).lower()
                team = "home" if team != "away" else "away"
                patch = a.get("patch") or {}
                if not isinstance(patch, dict):
                    continue
                # Patch is a subset of the TacticsBoardAdvanced config keys (camelCase) or our internal keys.
                pace_map = {0: 0.82, 1: 0.92, 2: 1.00, 3: 1.10, 4: 1.26}
                for k, v in patch.items():
                    key = str(k)
                    if key in ("pace",):
                        try:
                            idx = int(v)
                            if idx in pace_map:
                                team_ctx[team]["pace"] = float(pace_map[idx])
                        except Exception:
                            continue
                    elif key in ("focus", "off_focus"):
                        team_ctx[team]["off_focus"] = v
                    elif key in ("defenseType", "defense_type"):
                        team_ctx[team]["defense_type"] = v
                    elif key in ("pnrDefense", "pnr_defense"):
                        team_ctx[team]["pnr_defense"] = v
                    elif key in ("postDefense", "post_defense"):
                        team_ctx[team]["post_defense"] = v
                    elif key in ("spacing",):
                        team_ctx[team]["spacing"] = v
                    elif key in ("passingRisk", "passing_risk", "freedom", "transition"):
                        try:
                            team_ctx[team][{"passingRisk": "passing_risk"}.get(key, key)] = int(v)
                        except Exception:
                            continue
                    elif key in ("aggression", "offRebound", "threePoint", "pnrFrequency"):
                        mapf = {"offRebound": "off_rebound", "threePoint": "three_point", "pnrFrequency": "pnr_frequency"}
                        try:
                            team_ctx[team][mapf.get(key, key)] = float(v)
                        except Exception:
                            continue
                    elif key in ("matchups",):
                        if not isinstance(v, dict):
                            continue
                        try:
                            team_ctx[team]["matchups"] = {int(a): int(b) for a, b in v.items() if b is not None and a is not None}
                        except Exception:
                            continue
                log({"clock": clock_s(), "event": "tactics_change", "team": team, "patch": patch})

    def force_sub(team: str, out_id: int, *, reason: str) -> None:
        on = home_on if team == "home" else away_on
        bench = home_bench if team == "home" else away_bench
        out_idx = next((i for i, ps in enumerate(on) if ps.id == int(out_id)), None)
        if out_idx is None:
            return
        if not bench:
            return
        # Pick the most-rested bench player.
        in_idx = max(range(len(bench)), key=lambda i: bench[i].energy)
        out_ps = on[out_idx]
        in_ps = bench[in_idx]

        log({"clock": clock_s(), "event": reason, "team": team, "player_id": int(out_ps.id), "player": out_ps.name})

        in_ps.slot = out_ps.slot
        in_ps.pos = out_ps.pos
        in_ps.vel = (0.0, 0.0)
        out_ps.slot = in_ps.slot
        out_ps.vel = (0.0, 0.0)
        on[out_idx] = in_ps
        bench[in_idx] = out_ps
        by_id_state[in_ps.id] = in_ps
        by_id_state[out_ps.id] = out_ps
        on_court_ids[team] = {ps.id for ps in on}
        if ball.holder == out_ps.id:
            ball.holder = in_ps.id
        log({"clock": clock_s(), "event": "substitution", "team": team, "out": out_ps.name, "in": in_ps.name, "out_id": int(out_ps.id), "in_id": int(in_ps.id), "reason": reason})

    def move_towards(s: PlayerState, target: Vec2, max_speed: float, dt: float) -> None:
        desired = sub(target, s.pos)
        d = math.hypot(desired[0], desired[1])
        if d <= 1e-6:
            s.vel = (0.0, 0.0)
            return
        vdir = (desired[0] / d, desired[1] / d)
        v = max_speed
        step = mul(vdir, v)
        s.vel = step
        s.pos = court.clamp_in_bounds(add(s.pos, mul(step, dt)), margin=0.35)

    def bench_targets(team: str) -> List[Vec2]:
        # Keep inside bounds (CourtCanvas can't render outside court). Place near sideline.
        # Home bench: bottom sideline; Away bench: top sideline.
        x = (court.L * 0.18) if team == "home" else (court.L * 0.82)
        y0 = court.W * (0.92 if team == "home" else 0.08)
        step = 0.35
        out: List[Vec2] = []
        for i in range(5):
            out.append(court.clamp_in_bounds((x, y0 + (i - 2) * step), margin=0.35))
        return out

    def zone_spots(defense_type: str, defending_right: bool) -> List[Vec2]:
        low = str(defense_type or "").lower()
        rim_x, rim_y = court.rim(defending_right)
        # Some handy anchors relative to rim.
        if defending_right:
            x_guard = rim_x - 5.3
            x_wing = rim_x - 3.2
            x_big = rim_x - 1.5
        else:
            x_guard = rim_x + 5.3
            x_wing = rim_x + 3.2
            x_big = rim_x + 1.5
        if "3-2" in low:
            # 3 up, 2 back
            spots = [
                (x_guard, court.W * 0.30),
                (x_guard, court.W * 0.50),
                (x_guard, court.W * 0.70),
                (x_big, court.W * 0.38),
                (x_big, court.W * 0.62),
            ]
        elif "box" in low:
            # Box-and-1: box is zone-ish; slot 0 plays the "1" near handler.
            spots = [
                (x_guard, court.W * 0.50),
                (x_wing, court.W * 0.30),
                (x_wing, court.W * 0.70),
                (x_big, court.W * 0.38),
                (x_big, court.W * 0.62),
            ]
        else:
            # 2-3 default
            spots = [
                (x_guard, court.W * 0.36),
                (x_guard, court.W * 0.64),
                (x_wing, court.W * 0.22),
                (x_wing, court.W * 0.78),
                (x_big, court.W * 0.50),
            ]
        return [court.clamp_in_bounds(s, margin=0.5) for s in spots]

    def resolve_rebound(miss_team: str) -> Tuple[str, int, Dict[str, Any]]:
        rim = court.rim(attack_right[miss_team])
        crash = float(team_ctx.get(miss_team, {}).get("off_rebound") or 30.0)
        off_mult = _clamp(0.75 + (crash / 100.0) * 0.90, 0.6, 1.8)

        # Boxout micro-model (approx): defenders can suppress nearby offensive rebound chances.
        boxouts: List[Dict[str, Any]] = []
        boxed_off: Dict[int, float] = {}
        boxed_def: Dict[int, float] = {}
        off_roster = home_on if miss_team == "home" else away_on
        def_roster = away_on if miss_team == "home" else home_on
        for ds in def_roster:
            if dist(ds.pos, rim) > 4.2:
                continue
            # Candidate offensive rebounder to box out.
            cand = None
            best = 1e9
            for os in off_roster:
                d = dist(ds.pos, os.pos)
                if d < best and d <= 2.2:
                    best = d
                    cand = os
            if cand is None:
                continue
            dp = by_id_player.get(ds.id) or {}
            op = by_id_player.get(cand.id) or {}
            box_skill = (_attr(dp, "box_out", 500) + _attr(dp, "strength", 500) + _attr(dp, "discipline", 500)) / 3.0
            crash_skill = (_attr(op, "reb_off", 500) + _attr(op, "strength", 500) + _attr(op, "balance", 500)) / 3.0
            box01 = _rating_to_prob(int(box_skill), mid=520, scale=160)
            crash01 = _rating_to_prob(int(crash_skill), mid=520, scale=160)
            # Energy affects contact outcomes.
            box01 *= 0.70 + 0.30 * _clamp(float(ds.energy) / 100.0, 0.0, 1.0)
            crash01 *= 0.70 + 0.30 * _clamp(float(cand.energy) / 100.0, 0.0, 1.0)
            p_box = _clamp(0.35 + 0.55 * (box01 / max(0.01, box01 + crash01)), 0.05, 0.95)
            success = rng.random() < p_box
            boxouts.append({"def_id": int(ds.id), "off_id": int(cand.id), "success": bool(success)})
            if success:
                boxed_off[int(cand.id)] = max(float(boxed_off.get(int(cand.id), 1.0)), 0.55)
                boxed_def[int(ds.id)] = max(float(boxed_def.get(int(ds.id), 1.0)), 1.08)
            else:
                boxed_off[int(cand.id)] = max(float(boxed_off.get(int(cand.id), 1.0)), 1.12)

        weights: List[Tuple[str, int, float]] = []
        for t, roster in (("home", home_on), ("away", away_on)):
            for ps in roster:
                p = by_id_player[ps.id]
                skill = (_attr(p, "reb_off" if t == miss_team else "reb_def", 500) + _attr(p, "box_out", 500)) / 2.0
                w = float(skill) / (0.75 + dist(ps.pos, rim))
                if t == miss_team:
                    w *= off_mult
                    w *= float(boxed_off.get(int(ps.id), 1.0))
                else:
                    w *= float(boxed_def.get(int(ps.id), 1.0))
                weights.append((t, ps.id, w))
        total = sum(w for _, _, w in weights) or 1.0
        pick = rng.random() * total
        acc = 0.0
        for t, pid, w in weights:
            acc += w
            if acc >= pick:
                return t, pid, {"boxouts": boxouts}
        return "home", home_on[0].id, {"boxouts": boxouts}

    # Start of game will be initialized after helper functions are defined.
    ball.state = "dead"
    ball.holder = None

    def recover_bench(team: str, dt: float) -> None:
        bench = home_bench if team == "home" else away_bench
        for ps in bench:
            p = by_id_player.get(ps.id) or {}
            rec = _attr(p, "fatigue_recov", 500)
            rec01 = _rating_to_prob(int(rec), mid=520, scale=180)
            ps.energy = _clamp(ps.energy + (0.010 + 0.030 * rec01) * dt, 0.0, 100.0)

    def recover_on_court(team: str, dt: float) -> None:
        roster = home_on if team == "home" else away_on
        for ps in roster:
            p = by_id_player.get(ps.id) or {}
            rec = _attr(p, "fatigue_recov", 500)
            rec01 = _rating_to_prob(int(rec), mid=520, scale=180)
            ps.energy = _clamp(ps.energy + (0.004 + 0.012 * rec01) * dt, 0.0, 100.0)

    def drain_on_court(team: str, dt: float) -> None:
        roster = home_on if team == "home" else away_on
        for ps in roster:
            p = by_id_player.get(ps.id) or {}
            vmax = max(3.0, _player_speed_mps(p))
            vnow = math.hypot(ps.vel[0], ps.vel[1])
            intensity = _clamp(vnow / vmax, 0.0, 1.0)
            base = 0.006  # per second
            extra = 0.030 * (intensity**2)
            usage = 0.004 if ball.holder == ps.id else 0.0
            ps.energy = _clamp(ps.energy - (base + extra + usage) * dt, 0.0, 100.0)

    def free_throw_prob(player: Dict[str, Any], pressure: float) -> float:
        ft = _attr(player, "free_throw", 500)
        clutch = _attr(player, "clutch", 500)
        p = _rating_to_prob(int(ft), mid=520, scale=140)
        # pressure in [0..1]: late & close -> more pressure; clutch mitigates
        clutch01 = _rating_to_prob(int(clutch), mid=520, scale=180)
        pen = 0.08 * pressure * (1.0 - clutch01)
        return _clamp(p - pen, 0.35, 0.97)

    def take_bonus_free_throws(player: Dict[str, Any], pressure: float, *, kind: str) -> Tuple[int, int]:
        k = str(kind or "none")
        if k == "one_and_one":
            fta = 1
            ftm = 0
            if rng.random() < free_throw_prob(player, pressure):
                ftm += 1
                fta = 2
                if rng.random() < free_throw_prob(player, pressure):
                    ftm += 1
            return int(ftm), int(fta)
        if k == "double":
            ftm = 0
            fta = 2
            for _ in range(int(fta)):
                if rng.random() < free_throw_prob(player, pressure):
                    ftm += 1
            return int(ftm), int(fta)
        return 0, 0

    while True:
        if clock_ms <= 0:
            # Close the final period for score_by_period bookkeeping.
            try:
                if last_pi >= 0:
                    close_period(int(last_pi))
            except Exception:
                pass
            # Overtime: extend the match if tied (when configured).
            if ot_ms > 0 and int(score.get("home") or 0) == int(score.get("away") or 0):
                ot_count += 1
                total_ms += int(ot_ms)
                clock_ms = int(ot_ms)
                shot_clock_ms = int(rules.game.shot_clock_seconds * 1000)
                # New period: reset team fouls tracking for bonus rules.
                team_fouls["home"].append(0)
                team_fouls["away"].append(0)
                team_fouls_l2m["home"].append(0)
                team_fouls_l2m["away"].append(0)
                paint_ms.clear()
                # OT timeouts: add per-OT allocation.
                try:
                    add_ot = int(rules.game.timeouts_per_ot or 0)
                except Exception:
                    add_ot = 0
                if add_ot:
                    timeouts_left["home"] = int(timeouts_left.get("home") or 0) + int(add_ot)
                    timeouts_left["away"] = int(timeouts_left.get("away") or 0) + int(add_ot)
                # Small break + inbound to start.
                poss = "home" if rng.random() < 0.5 else "away"
                poss_counts[poss] = int(poss_counts.get(poss, 0) + 1)
                poss_arrow = "away" if poss == "home" else "home"
                start_inbound(poss, reason="overtime_start", loc="backcourt", duration_s=4.0)
                log(
                    {
                        "clock": clock_s(),
                        "event": "overtime_start",
                        "ot": int(ot_count),
                        "ot_seconds": int(ot_ms / 1000),
                        "total_seconds": int(total_ms / 1000),
                        "regulation_seconds": int(reg_total_ms / 1000),
                    }
                )
                last_pi = int(period_idx())
                last_half = int(half_idx(last_pi))
                continue
            break
        apply_actions()

        if deadball_s > 0.0:
            # Apply queued substitutions at the next stoppage.
            for t in ("home", "away"):
                queued = list(pending_subs.get(t) or [])
                if not queued:
                    continue
                pending_subs[t] = []
                on = home_on if t == "home" else away_on
                bench = home_bench if t == "home" else away_bench
                for out_id, in_id in queued:
                    out_idx = next((i for i, ps in enumerate(on) if ps.id == int(out_id)), None)
                    in_idx = next((i for i, ps in enumerate(bench) if ps.id == int(in_id)), None)
                    if out_idx is None or in_idx is None:
                        continue
                    out_ps = on[out_idx]
                    in_ps = bench[in_idx]
                    in_ps.slot = out_ps.slot
                    in_ps.pos = out_ps.pos
                    in_ps.vel = (0.0, 0.0)
                    out_ps.slot = in_ps.slot
                    out_ps.vel = (0.0, 0.0)
                    on[out_idx] = in_ps
                    bench[in_idx] = out_ps
                    by_id_state[in_ps.id] = in_ps
                    by_id_state[out_ps.id] = out_ps
                    on_court_ids[t] = {ps.id for ps in on}
                    if ball.holder == out_ps.id:
                        ball.holder = in_ps.id
                    deadball_s = max(deadball_s, 1.0)
                    log(
                        {
                            "clock": clock_s(),
                            "event": "substitution",
                            "team": t,
                            "out": out_ps.name,
                            "in": in_ps.name,
                            "out_id": int(out_ps.id),
                            "in_id": int(in_ps.id),
                            "reason": "queued",
                        }
                    )

            # Rotation plan enforcement (if provided): gently steer minutes by period.
            pi_now = period_idx()
            if int(pi_now) < int(game_periods):
                for t in ("home", "away"):
                    targets = rotation_targets_min.get(t) or {}
                    if not targets:
                        continue
                    if int(rotation_cooldown_until_ms.get(t, 0) or 0) > int(sim_elapsed_ms()):
                        continue
                    on = home_on if t == "home" else away_on
                    bench = home_bench if t == "home" else away_bench
                    if not on or not bench:
                        continue

                    def played_ms(pid: int) -> int:
                        per = min_period_ms.get(t, {}).get(int(pid)) or []
                        return int(per[pi_now]) if pi_now < len(per) else 0

                    out_cands: List[Tuple[float, int]] = []
                    for ps in on:
                        if is_manual_locked(t, int(ps.id)):
                            continue
                        plan = targets.get(int(ps.id))
                        if plan is None:
                            continue
                        target_min = int(plan[pi_now]) if pi_now < len(plan) else 0
                        tgt_ms = int(max(0, target_min) * 60_000)
                        p_ms = played_ms(int(ps.id))
                        over = p_ms - tgt_ms
                        if (target_min <= 0 and p_ms >= 15_000) or over >= 45_000:
                            out_cands.append((float(over), int(ps.id)))
                    # Fatigue-based extra push (only when rotation exists)
                    lowest = min(on, key=lambda x: float(x.energy))
                    if float(lowest.energy) <= 20.0:
                        out_cands.append((90_000.0, int(lowest.id)))

                    in_cands: List[Tuple[float, float, int]] = []
                    for ps in bench:
                        if is_manual_locked(t, int(ps.id)):
                            continue
                        plan = targets.get(int(ps.id))
                        if plan is None:
                            continue
                        target_min = int(plan[pi_now]) if pi_now < len(plan) else 0
                        tgt_ms = int(max(0, target_min) * 60_000)
                        p_ms = played_ms(int(ps.id))
                        rem = tgt_ms - p_ms
                        if rem >= 45_000:
                            in_cands.append((float(rem), float(ps.energy), int(ps.id)))
                    if not in_cands or not out_cands:
                        continue

                    out_cands.sort(reverse=True)
                    in_cands.sort(reverse=True)
                    max_swaps = 2
                    swaps: List[Tuple[int, int]] = []
                    used_out: set[int] = set()
                    used_in: set[int] = set()
                    for _, out_id in out_cands:
                        if out_id in used_out:
                            continue
                        cand_in = next((cid for _, _, cid in in_cands if cid not in used_in and cid != out_id), None)
                        if cand_in is None:
                            continue
                        swaps.append((int(out_id), int(cand_in)))
                        used_out.add(int(out_id))
                        used_in.add(int(cand_in))
                        if len(swaps) >= max_swaps:
                            break

                    if not swaps:
                        continue
                    # Avoid oscillations: after a rotation batch, wait a bit before enforcing again.
                    rotation_cooldown_until_ms[t] = int(sim_elapsed_ms()) + 45_000
                    for out_id, in_id in swaps:
                        out_idx = next((i for i, ps in enumerate(on) if ps.id == int(out_id)), None)
                        in_idx = next((i for i, ps in enumerate(bench) if ps.id == int(in_id)), None)
                        if out_idx is None or in_idx is None:
                            continue
                        out_ps = on[out_idx]
                        in_ps = bench[in_idx]
                        in_ps.slot = out_ps.slot
                        in_ps.pos = out_ps.pos
                        in_ps.vel = (0.0, 0.0)
                        out_ps.slot = in_ps.slot
                        out_ps.vel = (0.0, 0.0)
                        on[out_idx] = in_ps
                        bench[in_idx] = out_ps
                        by_id_state[in_ps.id] = in_ps
                        by_id_state[out_ps.id] = out_ps
                        on_court_ids[t] = {ps.id for ps in on}
                        if ball.holder == out_ps.id:
                            ball.holder = in_ps.id
                        deadball_s = max(deadball_s, 1.0)
                        log(
                            {
                                "clock": clock_s(),
                                "event": "substitution",
                                "team": t,
                                "out": out_ps.name,
                                "in": in_ps.name,
                                "out_id": int(out_ps.id),
                                "in_id": int(in_ps.id),
                                "reason": "rotation",
                            }
                        )
            # Animate timeout huddles towards bench while the game clock is stopped.
            if ball.state == "timeout":
                ht = bench_targets("home")
                at = bench_targets("away")
                for ps in home_on:
                    p = by_id_player[ps.id]
                    move_towards(ps, ht[ps.slot], _player_speed_mps(p) * 0.55, dt_internal)
                for ps in away_on:
                    p = by_id_player[ps.id]
                    move_towards(ps, at[ps.slot], _player_speed_mps(p) * 0.55, dt_internal)

            # Inbound timer (5s rule by universe): if we keep the ball dead too long, it's a turnover.
            if inbound_state is not None and ball.state == "dead":
                try:
                    inbound_state["elapsed_ms"] = int(inbound_state.get("elapsed_ms") or 0) + int(dt_internal_ms)
                    limit_ms = int(inbound_state.get("limit_ms") or 0)
                except Exception:
                    limit_ms = 0
                if limit_ms > 0 and int(inbound_state.get("elapsed_ms") or 0) >= int(limit_ms):
                    team = str(inbound_state.get("team") or poss).lower()
                    team = "home" if team != "away" else "away"
                    other = "away" if team == "home" else "home"
                    violator_id = int(inbound_state.get("from_id") or 0) or None
                    if violator_id and violator_id in stats.get(team, {}):
                        stats[team][violator_id]["tov"] += 1
                        violator_name = stats[team][violator_id]["name"]
                    else:
                        violator_name = "Inbound"
                    log(
                        {
                            "clock": clock_s(),
                            "event": "five_seconds_violation",
                            "team": team,
                            "player_id": int(violator_id) if violator_id else None,
                            "player": str(violator_name),
                            "force_emit": True,
                        }
                    )
                    inbound_state = None
                    pass_state = None
                    last_pass = None
                    shot = None
                    paint_ms.clear()
                    def_paint_ms.clear()
                    poss = other
                    poss_counts[poss] = int(poss_counts.get(poss, 0) + 1)
                    shot_clock_ms = int(rules.game.shot_clock_seconds * 1000)
                    backcourt_elapsed_ms = 0
                    deadball_s = max(deadball_s, 0.9)
                    start_inbound(poss, duration_s=0.9, reason="five_seconds", loc="backcourt")
                    if emit_acc >= emit_every:
                        emit_acc = 0.0
                        emit_tick()
                    continue
            deadball_s = max(0.0, deadball_s - dt_internal)
            emit_acc += dt_internal
            if deadball_s <= 0.0:
                if inbound_state is not None:
                    team = str(inbound_state.get("team") or poss)
                    team = "home" if team != "away" else "away"
                    poss = team
                    other = "away" if team == "home" else "home"
                    frm_id = int(inbound_state.get("from_id") or 0)
                    to_id = int(inbound_state.get("to_id") or 0)
                    frm_s = by_id_state.get(frm_id) or pick_inbounder(team)
                    to_s = by_id_state.get(to_id) or pick_ballhandler(team)
                    # Inbound isn't always immediate: under pressure it can take longer (and risk 5s).
                    try:
                        low_def = str((team_ctx.get(other, {}) or {}).get("defense_type") or "").lower()
                        press01 = 1.0 if ("press" in low_def or "full" in low_def) else 0.35 if ("zona" in low_def or "box" in low_def) else 0.15
                    except Exception:
                        press01 = 0.15
                    passer_p = by_id_player.get(frm_s.id) or {}
                    pass_skill = (_attr(passer_p, "passing", 500) + _attr(passer_p, "vision", 500) + _attr(passer_p, "pass_accuracy", 500)) / 3.0
                    pass_skill01 = _rating_to_prob(int(pass_skill), mid=520, scale=150)
                    energy01 = _clamp(float(frm_s.energy) / 100.0, 0.0, 1.0)
                    p_success = 0.70 + 0.22 * pass_skill01 - 0.22 * press01 - 0.10 * (1.0 - energy01)
                    p_success = _clamp(p_success, 0.05, 0.99)
                    if rng.random() > p_success:
                        # Keep searching for an option for a brief moment.
                        deadball_s = max(deadball_s, 0.35)
                    else:
                        pass_speed = 11.0 + 4.0 * _rating_to_prob(_attr(passer_p, "passing", 500), mid=520, scale=150)
                        flight_s = _clamp(dist(ball.pos, to_s.pos) / max(8.0, pass_speed), 0.12, 0.45)
                        pass_state = {
                            "team": team,
                            "from_id": int(frm_s.id),
                            "to_id": int(to_s.id),
                            "tleft": float(flight_s),
                            "ttotal": float(flight_s),
                            "from": (ball.pos[0], ball.pos[1]),
                            "to": (to_s.pos[0], to_s.pos[1]),
                            "intercept_by_id": None,
                            "intercept_by_team": None,
                        }
                        ball.state = "pass"
                        ball.holder = None
                        inbound_state = None
                else:
                    if ball.state == "timeout":
                        # After timeouts the game resumes with an inbound (ATO context).
                        start_inbound(poss, duration_s=1.2, reason="after_timeout", loc="backcourt" if in_backcourt else "frontcourt")
                    else:
                        ball.state = "live"
            recover_bench("home", dt_internal)
            recover_bench("away", dt_internal)
            recover_on_court("home", dt_internal)
            recover_on_court("away", dt_internal)
            if emit_acc >= emit_every:
                emit_acc = 0.0
                emit_tick()
            continue

        # Live ball
        clock_ms = max(0, clock_ms - dt_internal_ms)
        shot_clock_ms = max(0, shot_clock_ms - dt_internal_ms)
        emit_acc += dt_internal
        tick += 1

        # Period transitions (quarters/halves): add a realistic break + alternating possession.
        pi_now = int(period_idx())
        if pi_now != int(last_pi):
            try:
                close_period(int(last_pi))
            except Exception:
                pass

            # Reset/refresh timeouts based on scheme.
            if timeouts_scheme == "period" and timeouts_per_period > 0:
                timeouts_left["home"] = int(timeouts_per_period)
                timeouts_left["away"] = int(timeouts_per_period)
            elif timeouts_scheme == "half":
                hnow = int(half_idx(pi_now))
                if hnow != int(last_half):
                    base = int(init_timeouts_for_half(hnow) or 0)
                    if base > 0:
                        if timeouts_carryover:
                            timeouts_left["home"] = max(int(timeouts_left.get("home") or 0), base)
                            timeouts_left["away"] = max(int(timeouts_left.get("away") or 0), base)
                        else:
                            timeouts_left["home"] = int(base)
                            timeouts_left["away"] = int(base)
                    last_half = int(hnow)

            # Period-start possession: for most universes this effectively matches the "opening tip" alternation.
            # (OT handled separately.)
            if pi_now < int(game_periods):
                poss = str(poss_arrow)
                poss = "home" if poss != "away" else "away"
                poss_arrow = "away" if poss == "home" else "home"
                poss_counts[poss] = int(poss_counts.get(poss, 0) + 1)

            # Reset clocks + force dead-ball inbound.
            shot_clock_ms = int(rules.game.shot_clock_seconds * 1000)
            in_backcourt = True
            backcourt_elapsed_ms = 0
            paint_ms.clear()
            last_pass = None
            pass_state = None
            shot = None
            deadball_s = max(deadball_s, 3.2)
            start_inbound(poss, reason="period_start", loc="backcourt", duration_s=3.2)
            log({"clock": clock_s(), "event": "period_start", "pi": int(pi_now), "team": poss, "arrow": poss_arrow, "force_emit": True})
            last_pi = int(pi_now)
            continue

        # AI coach adjustments (only for non-human teams): small periodic tweaks based on context.
        ai_adjust_acc_ms += dt_internal_ms
        if ai_adjust_acc_ms >= 5000 and shot is None and pass_state is None and ball.state in ("live", "dead"):
            ai_adjust_acc_ms = 0
            for t in ("home", "away"):
                if bool(team_ctx.get(t, {}).get("human")):
                    continue
                other = "away" if t == "home" else "home"
                diff = int(score.get(t, 0) - score.get(other, 0))
                rem_ms = int(clock_ms)
                late = rem_ms <= 300_000

                pace_now = float(team_ctx[t].get("pace") or 1.0)
                focus_now = str(team_ctx[t].get("off_focus") or "balance").strip().lower()
                if focus_now in ("equilibrado", "balance"):
                    focus_now = "balance"

                # If trailing late: push pace and lean into perimeter/pnr.
                if late and diff <= -8:
                    team_ctx[t]["pace"] = float(_clamp(pace_now + 0.06, 0.7, 1.35))
                    team_ctx[t]["off_focus"] = "perimeter" if float(team_ctx[t].get("three_point") or 50) >= 55 else "pnr"
                    team_ctx[t]["passing_risk"] = min(2, int(team_ctx[t].get("passing_risk") or 1) + 1)
                    log({"clock": clock_s(), "event": "shout", "team": t, "label": "AI: Push"})
                # If leading late: slow down and protect the ball.
                elif late and diff >= 8:
                    team_ctx[t]["pace"] = float(_clamp(pace_now - 0.06, 0.7, 1.35))
                    team_ctx[t]["off_focus"] = focus_now if focus_now != "perimeter" else "balance"
                    team_ctx[t]["passing_risk"] = max(0, int(team_ctx[t].get("passing_risk") or 1) - 1)
                    log({"clock": clock_s(), "event": "shout", "team": t, "label": "AI: Stall"})
                # Early/mid game: mild corrections.
                elif diff <= -12:
                    team_ctx[t]["pace"] = float(_clamp(pace_now + 0.03, 0.7, 1.35))
                elif diff >= 12:
                    team_ctx[t]["pace"] = float(_clamp(pace_now - 0.03, 0.7, 1.35))

        # AI auto-subs (non-human teams): manage fatigue and foul trouble.
        ai_sub_acc_ms += dt_internal_ms
        if ai_sub_acc_ms >= 7000 and shot is None and pass_state is None and ball.state in ("live", "dead"):
            ai_sub_acc_ms = 0
            for t in ("home", "away"):
                if bool(team_ctx.get(t, {}).get("human")):
                    continue
                on = home_on if t == "home" else away_on
                if not on:
                    continue
                lowest = min(on, key=lambda ps: float(ps.energy))
                if float(lowest.energy) <= 30.0:
                    if ball.state == "live" and deadball_s <= 0.0:
                        bench = home_bench if t == "home" else away_bench
                        if bench:
                            in_ps = max(bench, key=lambda ps: float(ps.energy))
                            existing = pending_subs.get(t) or []
                            pending_subs[t] = [(o, i) for (o, i) in existing if int(o) != int(lowest.id)] + [(int(lowest.id), int(in_ps.id))]
                            log({"clock": clock_s(), "event": "ai_fatigue_sub", "team": t, "player_id": int(lowest.id), "player": lowest.name})
                            log({"clock": clock_s(), "event": "substitution_queued", "team": t, "out_id": int(lowest.id), "in_id": int(in_ps.id)})
                    else:
                        force_sub(t, int(lowest.id), reason="ai_fatigue_sub")
                    continue
                # Foul trouble late-ish: protect any player at foul_out-1.
                if int(clock_ms) <= 180_000:
                    limit = int(rules.game.foul_out or 5) - 1
                    trouble = next((ps for ps in on if int(stats.get(t, {}).get(int(ps.id), {}).get("pf") or 0) >= limit), None)
                    if trouble is not None:
                        if ball.state == "live" and deadball_s <= 0.0:
                            bench = home_bench if t == "home" else away_bench
                            if bench:
                                in_ps = max(bench, key=lambda ps: float(ps.energy))
                                existing = pending_subs.get(t) or []
                                pending_subs[t] = [(o, i) for (o, i) in existing if int(o) != int(trouble.id)] + [(int(trouble.id), int(in_ps.id))]
                                log({"clock": clock_s(), "event": "ai_foul_trouble_sub", "team": t, "player_id": int(trouble.id), "player": trouble.name})
                                log({"clock": clock_s(), "event": "substitution_queued", "team": t, "out_id": int(trouble.id), "in_id": int(in_ps.id)})
                        else:
                            force_sub(t, int(trouble.id), reason="ai_foul_trouble_sub")

        handler_id = ball.holder
        if handler_id is None and pass_state is not None:
            handler_id = int(pass_state.get("from_id") or 0) or None
        handler = by_id_state.get(int(handler_id) if handler_id is not None else pick_ballhandler(poss).id) or pick_ballhandler(poss)
        if ball.holder is not None and ball.state in ("live", "dead"):
            ball.pos = handler.pos

        # Minutes (on-court) + possession time (ball holder)
        pi_now = period_idx()
        for pid in on_court_ids.get("home", set()):
            if pid in min_ms["home"]:
                min_ms["home"][pid] += dt_internal_ms
                per = min_period_ms["home"].get(int(pid))
                if per is not None:
                    if pi_now >= len(per):
                        per.extend([0 for _ in range(pi_now - len(per) + 1)])
                    per[pi_now] += dt_internal_ms
        for pid in on_court_ids.get("away", set()):
            if pid in min_ms["away"]:
                min_ms["away"][pid] += dt_internal_ms
                per = min_period_ms["away"].get(int(pid))
                if per is not None:
                    if pi_now >= len(per):
                        per.extend([0 for _ in range(pi_now - len(per) + 1)])
                    per[pi_now] += dt_internal_ms
        _lineup_tick("home", int(dt_internal_ms))
        _lineup_tick("away", int(dt_internal_ms))
        if ball.holder is not None and ball.state == "live":
            poss_time_ms[int(ball.holder)] = int(poss_time_ms.get(int(ball.holder), 0) + dt_internal_ms)

        # Target spots
        spacing = str(team_ctx.get(poss, {}).get("spacing") or "")
        off_spots = _bringup_spots(court, attack_right[poss]) if in_backcourt else _spots_by_spacing(court, attack_right[poss], spacing)
        pm_for_move = current_play_mod(poss)
        play_spots: Optional[List[Vec2]] = None
        try:
            kf = pm_for_move.get("kf")
            if isinstance(kf, list) and kf and (not in_backcourt):
                started_ms = int(pm_for_move.get("started_ms") or 0)
                stage_ms = int(pm_for_move.get("stage_ms") or 1600)
                idx = int(max(0, (sim_elapsed_ms() - started_ms)) // max(1, stage_ms))
                idx = int(min(idx, len(kf) - 1))
                cand = kf[idx]
                if isinstance(cand, list) and len(cand) >= 5:
                    play_spots = [tuple(cand[i]) for i in range(5)]  # type: ignore[misc]
        except Exception:
            play_spots = None
        def_team = "away" if poss == "home" else "home"
        off_roster = home_on if poss == "home" else away_on
        def_roster = away_on if poss == "home" else home_on

        # Offense: handler roams between top and rim based on shot clock
        rim = court.rim(attack_right[poss])
        top = off_spots[0]
        pace = float(team_ctx.get(poss, {}).get("pace") or 1.0)
        focus = str(team_ctx.get(poss, {}).get("off_focus") or "balance").strip().lower()
        if focus in ("equilibrado", "balance"):
            focus = "balance"
        if focus in ("perimetro", "perímetro", "perimeter"):
            focus = "perimeter"
        if focus in ("poste bajo", "post"):
            focus = "post"
        if focus in ("pick & roll", "pick and roll", "pnr"):
            focus = "pnr"
        if focus in ("aislamiento", "iso"):
            focus = "iso"
        sc_total_ms = int(rules.game.shot_clock_seconds * 1000)
        drive_bias = _clamp((float(sc_total_ms - shot_clock_ms) / float(max(1, sc_total_ms))), 0.0, 1.0)
        drive_target = add(rim, (-1.2 if attack_right[poss] else 1.2, (rng.random() - 0.5) * 2.2))
        pnr01 = _clamp(float(team_ctx.get(poss, {}).get("pnr_frequency") or 50.0) / 100.0, 0.0, 1.0)
        three01 = _clamp(float(team_ctx.get(poss, {}).get("three_point") or 50.0) / 100.0, 0.0, 1.0)
        drive_prob = 0.10 + 0.25 * drive_bias
        drive_prob += (pnr01 - 0.5) * 0.10
        drive_prob -= (three01 - 0.5) * 0.12
        if focus in ("post", "iso", "attack"):
            drive_prob += 0.25
        if focus in ("perimeter", "3pt", "spacing"):
            drive_prob -= 0.25
        want_drive = bool(shot_clock_ms <= 8_000 or rng.random() < _clamp(drive_prob, 0.02, 0.70))
        handler_target = drive_target if want_drive else top

        # Simple PnR: slot 4 sets a screen near the handler and can trigger a drive.
        pnr_def = str(team_ctx.get(def_team, {}).get("pnr_defense") or "drop").strip().lower()
        screener = off_roster[4] if len(off_roster) >= 5 else None
        pnr_active = False
        screen_spot: Optional[Vec2] = None
        if screener is not None and (not in_backcourt) and ball.state == "live" and ball.holder == handler.id:
            if focus == "pnr" or (pnr01 >= 0.55 and 9_000 <= shot_clock_ms <= 20_000):
                side = 1.0 if handler.pos[1] < (court.W / 2.0) else -1.0
                dx = -0.9 if attack_right[poss] else 0.9
                screen_spot = court.clamp_in_bounds((handler.pos[0] + dx, handler.pos[1] + side * 0.9), margin=0.5)
                pnr_active = True
                if screen_spot and dist(handler.pos, screen_spot) <= 0.9:
                    want_drive = True
                    handler_target = drive_target

        for ps in off_roster:
            p = by_id_player[ps.id]
            max_v = _player_speed_mps(p) * (0.85 + 0.15 * (ps.energy / 100.0))
            if ps.id == handler.id:
                if play_spots is not None and ps.slot < len(play_spots):
                    w = 0.70
                    tgt = add(mul(handler_target, 1.0 - w), mul(play_spots[int(ps.slot)], w))
                    move_towards(ps, tgt, max_v * _clamp(pace, 0.7, 1.35), dt_internal)
                else:
                    move_towards(ps, handler_target, max_v * _clamp(pace, 0.7, 1.35), dt_internal)
            elif pnr_active and screener is not None and ps.id == screener.id and screen_spot is not None:
                move_towards(ps, screen_spot, max_v * _clamp(pace, 0.7, 1.35), dt_internal)
            else:
                tgt = off_spots[ps.slot]
                if play_spots is not None and ps.slot < len(play_spots):
                    w = 0.58
                    tgt = add(mul(tgt, 1.0 - w), mul(play_spots[int(ps.slot)], w))
                move_towards(ps, tgt, max_v * _clamp(pace, 0.7, 1.35), dt_internal)

        # Backcourt clock (universe rules): force the ball across halfcourt.
        if in_backcourt and ball.holder is not None and ball.state == "live":
            backcourt_elapsed_ms += dt_internal_ms
            half = court.L / 2.0
            crossed = (attack_right[poss] and ball.pos[0] > half) or ((not attack_right[poss]) and ball.pos[0] < half)
            if crossed:
                in_backcourt = False
                backcourt_elapsed_ms = 0
            elif backcourt_elapsed_ms >= int(rules.game.backcourt_seconds * 1000):
                violator_id = int(ball.holder or handler.id)
                if violator_id in stats.get(poss, {}):
                    stats[poss][violator_id]["tov"] += 1
                log(
                    {
                        "clock": clock_s(),
                        "event": "backcourt_violation",
                        "team": poss,
                        "player_id": violator_id,
                        "player": stats[poss][violator_id]["name"] if violator_id in stats.get(poss, {}) else f"Jugador {violator_id}",
                        "force_emit": True,
                    }
                )
                poss = def_team
                shot_clock_ms = int(rules.game.shot_clock_seconds * 1000)
                poss_counts[poss] = int(poss_counts.get(poss, 0) + 1)
                start_inbound(poss, duration_s=0.9, reason="backcourt_violation", loc="backcourt")
                if emit_acc >= emit_every:
                    emit_acc = 0.0
                    emit_tick()
                continue

        # Offensive 3-seconds (simple): any offensive player camping in paint while live ball.
        if (not in_backcourt) and ball.state == "live" and ball.holder is not None and shot is None and pass_state is None:
            violator: Optional[PlayerState] = None
            for ps in off_roster:
                if court.in_paint(ps.pos, attack_right[poss]):
                    paint_ms[ps.id] = int(paint_ms.get(ps.id, 0) + dt_internal_ms)
                else:
                    paint_ms[ps.id] = 0
                if paint_ms.get(ps.id, 0) >= 3000:
                    violator = ps
                    break
            if violator is not None:
                pid = int(violator.id)
                if pid in stats.get(poss, {}):
                    stats[poss][pid]["tov"] += 1
                log({"clock": clock_s(), "event": "three_seconds_violation", "team": poss, "player_id": pid, "player": stats[poss][pid]["name"] if pid in stats.get(poss, {}) else violator.name})
                paint_ms.clear()
                def_paint_ms.clear()
                poss = def_team
                last_pass = None
                shot_clock_ms = int(rules.game.shot_clock_seconds * 1000)
                poss_counts[poss] = int(poss_counts.get(poss, 0) + 1)
                start_inbound(poss, duration_s=0.9, reason="three_seconds", loc="backcourt")
                if emit_acc >= emit_every:
                    emit_acc = 0.0
                    emit_tick()
                continue

        # NBA/WNBA defensive 3-seconds (approx): technical FT + keep possession.
        if (
            defensive_three_seconds_enabled
            and (not in_backcourt)
            and ball.state == "live"
            and ball.holder is not None
            and shot is None
            and pass_state is None
        ):
            dviolator: Optional[PlayerState] = None
            for ds in def_roster:
                if court.in_paint(ds.pos, attack_right[poss]):
                    guarding = False
                    for os in off_roster:
                        if court.in_paint(os.pos, attack_right[poss]) and dist(ds.pos, os.pos) <= 1.05:
                            guarding = True
                            break
                    if guarding:
                        def_paint_ms[ds.id] = 0
                    else:
                        def_paint_ms[ds.id] = int(def_paint_ms.get(ds.id, 0) + dt_internal_ms)
                else:
                    def_paint_ms[ds.id] = 0
                if int(def_paint_ms.get(ds.id, 0) or 0) >= 3000:
                    dviolator = ds
                    break
            if dviolator is not None:
                # Technical FT (no rebound) and keep the same possession.
                tech_shooter = handler
                tech_p = by_id_player.get(tech_shooter.id) or {}
                pressure = 0.0
                ftm = 1 if rng.random() < free_throw_prob(tech_p, pressure) else 0
                shooter_row = stats[poss][tech_shooter.id]
                shooter_row["fta"] += 1
                shooter_row["ftm"] += int(ftm)
                shooter_row["pts"] += int(ftm)
                add_points(poss, int(ftm))
                update_efficiency(shooter_row)
                log(
                    {
                        "clock": clock_s(),
                        "event": "defensive_three_seconds",
                        "team": def_team,
                        "awarded_to": poss,
                        "player_id": int(dviolator.id),
                        "player": stats[def_team][dviolator.id]["name"] if dviolator.id in stats.get(def_team, {}) else dviolator.name,
                        "ftm": int(ftm),
                        "fta": 1,
                        "keep_possession": True,
                        "force_emit": True,
                    }
                )
                def_paint_ms.clear()
                last_pass = None
                deadball_s = max(deadball_s, 1.1)
                # Preserve shot clock (no reset) but restart from a frontcourt inbound.
                start_inbound(poss, duration_s=0.9, reason="defensive_three_seconds", loc="frontcourt")
                if emit_acc >= emit_every:
                    emit_acc = 0.0
                    emit_tick()
                continue

        # Defense: schemes + matchups (stable for MMP, but already feels much closer to FM-style "instructions")
        off_by_id = {ps.id: ps for ps in off_roster}
        def_cfg = team_ctx.get(def_team, {}) or {}
        defense_type = str(def_cfg.get("defense_type") or "Hombre a Hombre")
        low_def = defense_type.lower()
        press01_def = 1.0 if ("press" in low_def or "full" in low_def or "1-2-2" in low_def) else 0.0
        matchups = def_cfg.get("matchups") or {}
        defender_to_attacker: Dict[int, int] = {}
        if isinstance(matchups, dict) and matchups:
            for atk_id, def_id in matchups.items():
                try:
                    defender_to_attacker[int(def_id)] = int(atk_id)
                except Exception:
                    continue

        if "zona" in low_def or "box" in low_def:
            # Simple zone anchors that shift toward the ball.
            defending_right = bool(attack_right[poss])
            anchors = zone_spots(defense_type, defending_right)
            for ds in def_roster:
                p = by_id_player[ds.id]
                max_v = _player_speed_mps(p) * (0.9 + 0.1 * (ds.energy / 100.0))
                base = anchors[ds.slot]
                # Slot 0 in box-and-1 shadows the handler a bit more.
                if "box" in low_def and ds.slot == 0 and ball.holder is not None:
                    target = off_by_id.get(int(ball.holder)) or handler
                    base = add(base, mul(norm(sub(target.pos, base)), 1.2))
                shift = mul(norm(sub(ball.pos, base)), 1.1)
                defend_pos = add(base, shift)
                move_towards(ds, defend_pos, max_v, dt_internal)
        else:
            # Man-to-man with optional explicit matchups (attackerId -> defenderId).
            for ds in def_roster:
                atk_id = defender_to_attacker.get(ds.id)
                target_off = off_by_id.get(int(atk_id)) if atk_id is not None else off_roster[ds.slot]
                assigned_id = int(target_off.id)
                if pnr_active and screener is not None and pnr_def.startswith("switch"):
                    if assigned_id == int(handler.id):
                        target_off = screener
                        assigned_id = int(screener.id)
                    elif assigned_id == int(screener.id):
                        target_off = handler
                        assigned_id = int(handler.id)
                p = by_id_player[ds.id]
                max_v = _player_speed_mps(p) * (0.9 + 0.1 * (ds.energy / 100.0))
                gap = 0.55
                if press01_def > 0.0 and in_backcourt:
                    gap = min(gap, 0.35)
                if pnr_active and assigned_id == int(handler.id):
                    if "drop" in pnr_def:
                        gap = 0.85
                    elif "blitz" in pnr_def:
                        gap = 0.25
                    elif "hedge" in pnr_def:
                        gap = 0.40
                toward = sub(target_off.pos, ds.pos)
                tdir = norm(toward)
                defend_pos = sub(target_off.pos, mul(tdir, gap))
                move_towards(ds, defend_pos, max_v, dt_internal)

            # Basic help: if handler is driving into paint, bring one weakside helper toward rim.
            if pnr_active and want_drive and court.in_paint(handler.pos, attack_right[poss]) and len(def_roster) >= 3:
                helper = None
                best = 1e9
                rim_d = rim
                for ds in def_roster:
                    # Avoid over-helping with on-ball defender (closest to handler).
                    if dist(ds.pos, handler.pos) <= 1.0:
                        continue
                    d = dist(ds.pos, rim_d)
                    if d < best:
                        best = d
                        helper = ds
                if helper is not None:
                    p = by_id_player[helper.id]
                    max_v = _player_speed_mps(p) * 0.95
                    move_towards(helper, add(rim_d, (-0.6 if attack_right[poss] else 0.6, 0.0)), max_v, dt_internal)

        # Energy: drain on-court, recover bench
        drain_on_court("home", dt_internal)
        drain_on_court("away", dt_internal)
        recover_bench("home", dt_internal)
        recover_bench("away", dt_internal)

        # Simple collision repulsion
        all_s = off_roster + def_roster
        for i in range(len(all_s)):
            for j in range(i + 1, len(all_s)):
                a = all_s[i]
                b = all_s[j]
                d = dist(a.pos, b.pos)
                if d <= 0.55 and d > 1e-6:
                    push = (0.55 - d) * 0.35
                    dirab = norm(sub(a.pos, b.pos))
                    a.pos = court.clamp_in_bounds(add(a.pos, mul(dirab, push)), margin=0.35)
                    b.pos = court.clamp_in_bounds(add(b.pos, mul(dirab, -push)), margin=0.35)

        # Resolve pass if in flight
        if pass_state is not None:
            pass_state["tleft"] = float(pass_state.get("tleft") or 0.0) - dt_internal
            tleft = float(pass_state.get("tleft") or 0.0)
            total = float(pass_state.get("ttotal") or 0.0) or 0.001
            t = _clamp(1.0 - (tleft / total), 0.0, 1.0)
            frm: Vec2 = pass_state.get("from") or ball.pos
            to: Vec2 = pass_state.get("to") or ball.pos
            ball.pos = (frm[0] + (to[0] - frm[0]) * t, frm[1] + (to[1] - frm[1]) * t)
            if tleft <= 0.0:
                pass_team = str(pass_state.get("team") or poss)
                pass_team = "home" if pass_team != "away" else "away"
                if pass_state.get("intercept_by_id"):
                    interceptor_id = int(pass_state.get("intercept_by_id") or 0)
                    interceptor_team = str(pass_state.get("intercept_by_team") or def_team)
                    interceptor = by_id_state.get(interceptor_id)
                    # Book turnover + steal.
                    passer_id = int(pass_state.get("from_id") or 0)
                    if passer_id:
                        stats[poss][passer_id]["tov"] += 1
                    if interceptor_team in stats and interceptor_id in stats[interceptor_team]:
                        stats[interceptor_team][interceptor_id]["stl"] += 1
                    log(
                        {
                            "clock": clock_s(),
                            "event": "turnover",
                            "team": poss,
                            "player_id": passer_id,
                            "player": stats[poss][passer_id]["name"] if passer_id in stats[poss] else f"Jugador {passer_id}",
                            "by_id": interceptor_id,
                            "by": (stats.get(interceptor_team, {}).get(interceptor_id) or {}).get("name") or f"Jugador {interceptor_id}",
                        }
                    )
                    poss = interceptor_team
                    last_pass = None
                    in_backcourt = True
                    backcourt_elapsed_ms = 0
                    shot_clock_ms = int(rules.game.shot_clock_seconds * 1000)
                    poss_counts[poss] = int(poss_counts.get(poss, 0) + 1)
                    # A stolen ball usually kills the called action.
                    try:
                        play_active[pass_team] = {"until_ms": 0, "ctx": None, "pass_add": 0.0, "shot_add": 0.0, "tov_mult": 1.0}
                    except Exception:
                        pass
                    # Live-ball steal for realism.
                    ball.state = "live"
                    ball.holder = interceptor_id if interceptor is not None else pick_ballhandler(poss).id
                    ball.pos = (interceptor.pos if interceptor is not None else by_id_state[int(ball.holder)].pos)
                else:
                    receiver_id = int(pass_state.get("to_id") or 0)
                    receiver = by_id_state.get(receiver_id)
                    if receiver is not None:
                        ball.holder = receiver.id
                        ball.pos = receiver.pos
                        ball.state = "live"
                        last_pass = {
                            "from_id": int(pass_state.get("from_id") or 0),
                            "to_id": int(pass_state.get("to_id") or 0),
                            "clock_ms": int(clock_ms),
                            "team": str(pass_state.get("team") or poss),
                        }
                        _advance_play_step(pass_team, int(last_pass["from_id"]), int(last_pass["to_id"]))
                pass_state = None

        # Resolve shot if in flight
        if shot is not None:
            shot["tleft"] = float(shot["tleft"]) - dt_internal
            # Ball flight interpolation
            tleft = float(shot.get("tleft") or 0.0)
            total = float(shot.get("ttotal") or 0.0) or 0.001
            t = _clamp(1.0 - (tleft / total), 0.0, 1.0)
            frm: Vec2 = shot.get("from") or ball.pos
            to: Vec2 = shot.get("to") or ball.pos
            ball.pos = (frm[0] + (to[0] - frm[0]) * t, frm[1] + (to[1] - frm[1]) * t)
            if shot["tleft"] <= 0.0:
                shooter_id = int(shot["shooter_id"])
                team = str(shot["team"])
                is_three = bool(shot["is_three"])
                made = bool(shot["made"])
                blocked_by_id = int(shot.get("blocked_by_id") or 0) or None
                goaltend_by_id = int(shot.get("goaltend_by_id") or 0) or None
                if goaltend_by_id is not None:
                    made = True
                if blocked_by_id is not None and goaltend_by_id is None:
                    made = False
                was_fouled = bool(shot.get("foul"))
                foul_by_id = int(shot.get("foul_by_id") or 0) or None
                shooter_row = stats[team][shooter_id]
                shooter_row["fga"] += 1
                if is_three:
                    shooter_row["3pa"] += 1
                if made:
                    shooter_row["fgm"] += 1
                    pts = 3 if is_three else 2
                    if is_three:
                        shooter_row["3pm"] += 1
                    shooter_row["pts"] += pts
                    add_points(team, pts)
                    form_by_pid[shooter_id] = float(_clamp(float(form_by_pid.get(shooter_id, 0.0)) + 0.20, -1.0, 1.0))
                    shot_chart.append(
                        {
                            "clock": clock_s(),
                            "team": team,
                            "player_id": shooter_id,
                            "made": True,
                            "is_three": bool(is_three),
                            "x": float(shot.get("x") or 0.0),
                            "y": float(shot.get("y") or 0.0),
                            "contest": float(shot.get("contest") or 0.0),
                            "p_make": float(shot.get("p_make") or 0.0),
                        }
                    )
                    if goaltend_by_id is not None:
                        by_team = "away" if team == "home" else "home"
                        by_name = (stats.get(by_team, {}).get(int(goaltend_by_id)) or {}).get("name") or f"Jugador {goaltend_by_id}"
                        log(
                            {
                                "clock": clock_s(),
                                "event": "goaltending",
                                "team": team,
                                "player_id": shooter_id,
                                "player": shooter_row["name"],
                                "by_team": by_team,
                                "by_id": int(goaltend_by_id),
                                "by": str(by_name),
                                "pts": 3 if is_three else 2,
                                "x": float(shot.get("x") or 0.0),
                                "y": float(shot.get("y") or 0.0),
                                "contest": float(shot.get("contest") or 0.0),
                                "why": shot.get("why"),
                                "force_emit": True,
                            }
                        )
                    else:
                        ast_by_id = int(shot.get("assist_from_id") or 0) or None
                        ast_by = None
                        if ast_by_id and ast_by_id in stats.get(team, {}):
                            stats[team][ast_by_id]["ast"] += 1
                            ast_by = stats[team][ast_by_id]["name"]
                        evt = {
                            "clock": clock_s(),
                            "event": "3pt_make" if is_three else "2pt_make",
                            "team": team,
                            "player_id": shooter_id,
                            "player": shooter_row["name"],
                            "x": float(shot.get("x") or 0.0),
                            "y": float(shot.get("y") or 0.0),
                            "contest": float(shot.get("contest") or 0.0),
                            "p_make": float(shot.get("p_make") or 0.0),
                            "why": shot.get("why"),
                        }
                        if ast_by:
                            evt["ast_by_id"] = int(ast_by_id)
                            evt["ast_by"] = str(ast_by)
                        log(evt)
                    # inbound pause
                    shot_clock_ms = int(rules.game.shot_clock_seconds * 1000)
                    poss = "away" if team == "home" else "home"
                    start_inbound(poss, duration_s=1.2, reason="after_score")
                else:
                    # Misses cool the form; mental toughness dampens negative tilt a bit.
                    shooter_p = by_id_player.get(shooter_id) or {}
                    tough = _attr(shooter_p, "mental_tough", 500)
                    damp = 0.60 + 0.40 * _rating_to_prob(int(tough), mid=520, scale=180)
                    form_by_pid[shooter_id] = float(_clamp(float(form_by_pid.get(shooter_id, 0.0)) - 0.15 * damp, -1.0, 1.0))
                    shot_chart.append(
                        {
                            "clock": clock_s(),
                            "team": team,
                            "player_id": shooter_id,
                            "made": False,
                            "is_three": bool(is_three),
                            "x": float(shot.get("x") or 0.0),
                            "y": float(shot.get("y") or 0.0),
                            "contest": float(shot.get("contest") or 0.0),
                            "p_make": float(shot.get("p_make") or 0.0),
                        }
                    )
                    if blocked_by_id is not None:
                        blk_team = "away" if team == "home" else "home"
                        if int(blocked_by_id) in stats.get(blk_team, {}):
                            stats[blk_team][int(blocked_by_id)]["blk"] += 1
                        log(
                            {
                                "clock": clock_s(),
                                "event": "block",
                                "team": blk_team,
                                "player_id": int(blocked_by_id),
                                "player": (stats.get(blk_team, {}).get(int(blocked_by_id)) or {}).get("name") or f"Jugador {blocked_by_id}",
                                "on_id": int(shooter_id),
                                "on": shooter_row["name"],
                                "is_three": bool(is_three),
                                "force_emit": True,
                            }
                        )
                    log(
                        {
                            "clock": clock_s(),
                            "event": "3pt_miss" if is_three else "2pt_miss",
                            "team": team,
                            "player_id": shooter_id,
                            "player": shooter_row["name"],
                            "x": float(shot.get("x") or 0.0),
                            "y": float(shot.get("y") or 0.0),
                            "contest": float(shot.get("contest") or 0.0),
                            "p_make": float(shot.get("p_make") or 0.0),
                            "why": shot.get("why"),
                        }
                    )
                    if not was_fouled:
                        reb_team, reb_pid, reb_meta = resolve_rebound(team)
                        stats[reb_team][reb_pid]["reb"] += 1
                        if reb_team == team:
                            stats[reb_team][reb_pid]["orb"] += 1
                        else:
                            stats[reb_team][reb_pid]["drb"] += 1
                        log(
                            {
                                "clock": clock_s(),
                                "event": "off_reb" if reb_team == team else "def_reb",
                                "team": reb_team,
                                "player_id": reb_pid,
                                "player": stats[reb_team][reb_pid]["name"],
                                "boxouts": reb_meta.get("boxouts") if isinstance(reb_meta, dict) else None,
                            }
                        )
                        handled_after_reb = False
                        # Putback / tip-in immediately after an offensive rebound.
                        if reb_team == team:
                            putbacker_s = by_id_state.get(int(reb_pid))
                            if putbacker_s is not None:
                                rim_pos = court.rim(attack_right[team])
                                if dist(putbacker_s.pos, rim_pos) <= 1.85:
                                    put_p = by_id_player.get(int(reb_pid)) or {}
                                    fin = (_attr(put_p, "finishing_close", 500) + _attr(put_p, "contact_finishing", 500)) / 2.0
                                    fin01 = _rating_to_prob(int(fin), mid=520, scale=170)
                                    tip01 = _rating_to_prob(int(_attr(put_p, "tip_in", 500)), mid=520, scale=180)
                                    hands01 = _rating_to_prob(int(_attr(put_p, "hands", 500)), mid=520, scale=180)
                                    # More likely if the offense is actively crashing.
                                    crash = float(team_ctx.get(team, {}).get("off_rebound") or 30.0)
                                    crash01 = _clamp(crash / 100.0, 0.0, 1.0)
                                    put_chance = 0.06 + 0.10 * fin01 + 0.08 * tip01 + 0.06 * crash01
                                    if rng.random() < _clamp(put_chance, 0.04, 0.34):
                                        opp_team = "away" if team == "home" else "home"
                                        d2 = nearest_defender(putbacker_s)
                                        contest2 = _contest01(putbacker_s, d2)
                                        fatigue01 = _clamp((100.0 - float(putbacker_s.energy)) / 100.0, 0.0, 1.0)
                                        p_put = (0.18 + 0.78 * fin01) * (0.60 + 0.40 * hands01)
                                        p_put *= (1.0 - 0.60 * _clamp(contest2, 0.0, 1.0))
                                        p_put *= (1.0 - 0.25 * fatigue01)
                                        p_put = _clamp(p_put, 0.05, 0.98)
                                        made_put = rng.random() < p_put
                                        shooter2 = stats[team][int(reb_pid)]
                                        shooter2["fga"] += 1
                                        if made_put:
                                            shooter2["fgm"] += 1
                                            shooter2["pts"] += 2
                                            add_points(team, 2)
                                        update_efficiency(shooter2)
                                        log(
                                            {
                                                "clock": clock_s(),
                                                "event": "putback_make" if made_put else "putback_miss",
                                                "team": team,
                                                "player_id": int(reb_pid),
                                                "player": shooter2["name"],
                                                "contest": float(contest2),
                                                "p_make": float(p_put),
                                                "by_id": int(d2.id),
                                                "by": (stats.get(opp_team, {}).get(int(d2.id)) or {}).get("name") or d2.name,
                                                "force_emit": True,
                                            }
                                        )
                                        last_pass = None
                                        paint_ms.clear()
                                        def_paint_ms.clear()
                                        if made_put:
                                            shot_clock_ms = int(rules.game.shot_clock_seconds * 1000)
                                            poss = opp_team
                                            poss_counts[poss] = int(poss_counts.get(poss, 0) + 1)
                                            in_backcourt = True
                                            backcourt_elapsed_ms = 0
                                            start_inbound(poss, duration_s=1.1, reason="after_score_putback")
                                            ball.state = "dead"
                                            handled_after_reb = True
                                        else:
                                            # Missed putback -> another rebound.
                                            reb2_team, reb2_pid, reb2_meta = resolve_rebound(team)
                                            stats[reb2_team][reb2_pid]["reb"] += 1
                                            if reb2_team == team:
                                                stats[reb2_team][reb2_pid]["orb"] += 1
                                            else:
                                                stats[reb2_team][reb2_pid]["drb"] += 1
                                            log(
                                                {
                                                    "clock": clock_s(),
                                                    "event": "off_reb" if reb2_team == team else "def_reb",
                                                    "team": reb2_team,
                                                    "player_id": reb2_pid,
                                                    "player": stats[reb2_team][reb2_pid]["name"],
                                                    "after_putback": True,
                                                    "boxouts": reb2_meta.get("boxouts") if isinstance(reb2_meta, dict) else None,
                                                }
                                            )
                                            if reb2_team != team:
                                                shot_clock_ms = int(rules.game.shot_clock_seconds * 1000)
                                                poss = reb2_team
                                                poss_counts[poss] = int(poss_counts.get(poss, 0) + 1)
                                            else:
                                                shot_clock_ms = int(rules.game.shot_clock_reset_off_reb_seconds * 1000)
                                                poss = team
                                            last_pass = None
                                            in_backcourt = bool(reb2_team != team)
                                            backcourt_elapsed_ms = 0
                                            handler = pick_ballhandler(poss)
                                            ball.holder = handler.id
                                            ball.pos = handler.pos
                                            ball.state = "live"
                                            handled_after_reb = True

                        if not handled_after_reb:
                            if reb_team != team:
                                shot_clock_ms = int(rules.game.shot_clock_seconds * 1000)
                                poss = reb_team
                                poss_counts[poss] = int(poss_counts.get(poss, 0) + 1)
                            else:
                                shot_clock_ms = int(rules.game.shot_clock_reset_off_reb_seconds * 1000)
                                poss = team
                            last_pass = None
                            in_backcourt = bool(reb_team != team)
                            backcourt_elapsed_ms = 0
                            handler = pick_ballhandler(poss)
                            ball.holder = handler.id
                            ball.pos = handler.pos
                            ball.state = "live"
                    else:
                        # Dead ball for free throws (rebound handled later).
                        ball.state = "dead"
                update_efficiency(shooter_row)
                # Shooting foul / FTs (simplified)
                if was_fouled and foul_by_id:
                    opp = "away" if team == "home" else "home"
                    defender_row = stats.get(opp, {}).get(int(foul_by_id))
                    if defender_row is not None:
                        defender_row["pf"] = int(defender_row.get("pf") or 0) + 1
                        pi = period_idx()
                        team_fouls[opp][pi] = int(team_fouls[opp][pi] or 0) + 1
                        if int(rules.bonus.last2min_seconds or 0) > 0 and period_remaining_ms() <= int(rules.bonus.last2min_seconds) * 1000:
                            team_fouls_l2m[opp][pi] = int(team_fouls_l2m[opp][pi] or 0) + 1
                        if int(defender_row.get("pf") or 0) >= int(rules.game.foul_out or 5):
                            force_sub(opp, int(foul_by_id), reason="foul_out")
                    # Determine attempts: and-one or 2/3 shots
                    fta = 1 if made else (3 if is_three else 2)
                    shooter_p = by_id_player.get(shooter_id) or {}
                    pressure = 1.0 if (clock_ms <= 120_000 and abs(score["home"] - score["away"]) <= 5) else 0.3 if clock_ms <= 240_000 else 0.0
                    ftm = 0
                    for _ in range(int(fta)):
                        if rng.random() < free_throw_prob(shooter_p, pressure):
                            ftm += 1
                    shooter_row["fta"] += int(fta)
                    shooter_row["ftm"] += int(ftm)
                    shooter_row["pts"] += int(ftm)
                    add_points(team, int(ftm))
                    # FTs influence form slightly.
                    if ftm >= max(1, int(fta) - 1):
                        form_by_pid[shooter_id] = float(_clamp(float(form_by_pid.get(shooter_id, 0.0)) + 0.10, -1.0, 1.0))
                    elif ftm == 0 and int(fta) >= 2:
                        form_by_pid[shooter_id] = float(_clamp(float(form_by_pid.get(shooter_id, 0.0)) - 0.08, -1.0, 1.0))
                    update_efficiency(shooter_row)
                    log(
                        {
                            "clock": clock_s(),
                            "event": "foul",
                            "team": team,
                            "player_id": shooter_id,
                            "player": shooter_row["name"],
                            "by_id": int(foul_by_id),
                            "by": (defender_row or {}).get("name") or f"Jugador {foul_by_id}",
                            "ftm": int(ftm),
                            "fta": int(fta),
                        }
                    )
                    # After FTs: rebound if missed; otherwise possession flips.
                    last_pass = None
                    if int(ftm) < int(fta):
                        reb_team, reb_pid, reb_meta = resolve_rebound(team)
                        stats[reb_team][reb_pid]["reb"] += 1
                        if reb_team == team:
                            stats[reb_team][reb_pid]["orb"] += 1
                        else:
                            stats[reb_team][reb_pid]["drb"] += 1
                        log(
                            {
                                "clock": clock_s(),
                                "event": "off_reb" if reb_team == team else "def_reb",
                                "team": reb_team,
                                "player_id": reb_pid,
                                "player": stats[reb_team][reb_pid]["name"],
                                "ft_reb": True,
                                "boxouts": reb_meta.get("boxouts") if isinstance(reb_meta, dict) else None,
                            }
                        )
                        if reb_team != team:
                            poss = reb_team
                            poss_counts[poss] = int(poss_counts.get(poss, 0) + 1)
                            shot_clock_ms = int(rules.game.shot_clock_seconds * 1000)
                            in_backcourt = True
                        else:
                            poss = team
                            shot_clock_ms = int(rules.game.shot_clock_reset_off_reb_seconds * 1000)
                            in_backcourt = False
                    else:
                        poss = "away" if team == "home" else "home"
                        poss_counts[poss] = int(poss_counts.get(poss, 0) + 1)
                        shot_clock_ms = int(rules.game.shot_clock_seconds * 1000)
                        in_backcourt = True
                    backcourt_elapsed_ms = 0
                    deadball_s = max(deadball_s, 1.8)
                    ball.state = "dead"
                    handler = pick_ballhandler(poss)
                    ball.holder = handler.id
                    ball.pos = handler.pos
                shot = None

        # Shot clock violation
        if shot is None and shot_clock_ms <= 0:
            log({"clock": clock_s(), "event": "shot_clock_violation", "team": poss, "force_emit": True})
            poss = "away" if poss == "home" else "home"
            shot_clock_ms = int(rules.game.shot_clock_seconds * 1000)
            poss_counts[poss] = int(poss_counts.get(poss, 0) + 1)
            start_inbound(poss, duration_s=0.9, reason="shot_clock_violation", loc="backcourt")
            if emit_acc >= emit_every:
                emit_acc = 0.0
                emit_tick()
            continue

        # End-of-period context: trigger a late-clock play call (EoQ) for richer tactics feel.
        if shot is None and pass_state is None and ball.state == "live" and ball.holder is not None and (not in_backcourt):
            if int(period_remaining_ms()) <= 9000 and not current_play_mod(poss).get("ctx"):
                activate_play(poss, "EoQ", reason="end_of_period", loc="frontcourt")

        # Decision: pass / attempt shot (utility-lite)
        if shot is None and pass_state is None and ball.state == "live" and ball.holder is not None:
            shooter_p = by_id_player[handler.id]
            focus = str(team_ctx.get(poss, {}).get("off_focus") or "balance").strip().lower()
            if focus in ("equilibrado", "balance"):
                focus = "balance"
            if focus in ("perimetro", "perímetro", "perimeter"):
                focus = "perimeter"
            if focus in ("poste bajo", "post"):
                focus = "post"
            if focus in ("pick & roll", "pick and roll", "pnr"):
                focus = "pnr"
            if focus in ("aislamiento", "iso"):
                focus = "iso"

            # Extra live-ball events/violations to enrich possessions (FM-like "rules feel").
            defender_live = primary_defender(handler, def_team)
            defender_live_p = by_id_player.get(defender_live.id) or {}
            pressure_live = _clamp(1.0 - (dist(handler.pos, defender_live.pos) / 2.0), 0.0, 1.0)
            sec_iq_live = (
                _attr(shooter_p, "ball_security_iq", 500) + _attr(shooter_p, "ball_control", 500) + _attr(shooter_p, "ball_protect", 500)
            ) / 3.0
            footwork_live = (_attr(shooter_p, "footwork", 500) + _attr(shooter_p, "balance", 500)) / 2.0
            security01_live = _rating_to_prob(int((sec_iq_live + footwork_live) / 2.0), mid=520, scale=170)
            vmax_live = max(3.0, _player_speed_mps(shooter_p))
            vnow_live = math.hypot(handler.vel[0], handler.vel[1])
            speed01_live = _clamp(float(vnow_live) / float(vmax_live), 0.0, 1.0)

            # Travel (walking/carrying). Higher chance at high speed + low security under pressure.
            travel_rate = 0.004 + 0.020 * speed01_live * (1.0 - security01_live) + 0.012 * pressure_live * (1.0 - security01_live)
            if want_drive and court.in_paint(handler.pos, attack_right[poss]):
                travel_rate += 0.004
            if rng.random() < _clamp(travel_rate * dt_internal, 0.0, 0.10):
                if handler.id in stats.get(poss, {}):
                    stats[poss][handler.id]["tov"] += 1
                log(
                    {
                        "clock": clock_s(),
                        "event": "turnover",
                        "kind": "travel",
                        "team": poss,
                        "player_id": handler.id,
                        "player": stats[poss][handler.id]["name"],
                        "force_emit": True,
                    }
                )
                last_pass = None
                paint_ms.clear()
                def_paint_ms.clear()
                poss = def_team
                poss_counts[poss] = int(poss_counts.get(poss, 0) + 1)
                shot_clock_ms = int(rules.game.shot_clock_seconds * 1000)
                backcourt_elapsed_ms = 0
                start_inbound(poss, duration_s=0.9, reason="travel", loc="backcourt" if in_backcourt else "frontcourt")
                if emit_acc >= emit_every:
                    emit_acc = 0.0
                    emit_tick()
                continue

            # Offensive foul / charge (approx): only on drives in the frontcourt.
            if (not in_backcourt) and want_drive and court.in_paint(handler.pos, attack_right[poss]):
                contest_live = _contest01(handler, defender_live)
                agg01 = _rating_to_prob(int(_attr(shooter_p, "aggressiveness", 500)), mid=520, scale=170)
                disc01 = _rating_to_prob(int(_attr(shooter_p, "discipline", 500)), mid=520, scale=170)
                draw01 = _rating_to_prob(int(_attr(defender_live_p, "draw_charge", 500)), mid=520, scale=170)
                charge_rate = 0.002 + 0.020 * pressure_live * draw01 * (1.0 - security01_live) + 0.012 * contest_live
                charge_rate += 0.008 * agg01 * (1.0 - disc01)
                if rng.random() < _clamp(charge_rate * dt_internal, 0.0, 0.12):
                    pi = int(period_idx())
                    if handler.id in stats.get(poss, {}):
                        stats[poss][handler.id]["tov"] += 1
                        stats[poss][handler.id]["pf"] += 1
                    try:
                        team_fouls[poss][pi] = int(team_fouls[poss][pi] or 0) + 1
                    except Exception:
                        pass
                    log(
                        {
                            "clock": clock_s(),
                            "event": "charge",
                            "team": poss,
                            "player_id": handler.id,
                            "player": stats[poss][handler.id]["name"],
                            "by_id": int(defender_live.id),
                            "by": (stats.get(def_team, {}).get(defender_live.id) or {}).get("name") or defender_live.name,
                            "force_emit": True,
                        }
                    )
                    if int(stats[poss][handler.id].get("pf") or 0) >= int(rules.game.foul_out or 5):
                        force_sub(poss, int(handler.id), reason="foul_out")
                    last_pass = None
                    paint_ms.clear()
                    def_paint_ms.clear()
                    poss = def_team
                    poss_counts[poss] = int(poss_counts.get(poss, 0) + 1)
                    shot_clock_ms = int(rules.game.shot_clock_seconds * 1000)
                    backcourt_elapsed_ms = 0
                    start_inbound(poss, duration_s=0.9, reason="charge", loc="frontcourt")
                    if emit_acc >= emit_every:
                        emit_acc = 0.0
                        emit_tick()
                    continue

            # Held ball (tie-up) -> arrow (FIBA/NCAA) or jump ball (NBA/WNBA).
            held_rate = 0.0015 + 0.010 * pressure_live * (1.0 - security01_live)
            steal_hands01 = _rating_to_prob(int(_attr(defender_live_p, "steal_onball", 500)), mid=520, scale=170)
            held_rate += 0.004 * steal_hands01 * pressure_live
            if rng.random() < _clamp(held_rate * dt_internal, 0.0, 0.08):
                off_team = poss
                def_team_now = def_team
                winner = None
                if alt_possession:
                    winner = str(poss_arrow)
                    winner = "home" if winner != "away" else "away"
                    poss_arrow = "away" if winner == "home" else "home"
                    log(
                        {
                            "clock": clock_s(),
                            "event": "held_ball",
                            "team": off_team,
                            "player_id": handler.id,
                            "player": stats[off_team][handler.id]["name"],
                            "by_id": int(defender_live.id),
                            "by": (stats.get(def_team_now, {}).get(defender_live.id) or {}).get("name") or defender_live.name,
                            "arrow_awards": winner,
                            "arrow_next": poss_arrow,
                            "force_emit": True,
                        }
                    )
                else:
                    # Jump ball winner (approx): strength + height + rebound/jump skill.
                    off_p = by_id_player.get(handler.id) or {}
                    def_p = defender_live_p
                    off_j = (_attr(off_p, "jump_ball", 500) + _attr(off_p, "strength", 500) + _attr(off_p, "reb_def", 500)) / 3.0
                    def_j = (_attr(def_p, "jump_ball", 500) + _attr(def_p, "strength", 500) + _attr(def_p, "reb_def", 500)) / 3.0
                    off_w = 0.45 + 0.55 * _rating_to_prob(int(off_j), mid=520, scale=180)
                    def_w = 0.45 + 0.55 * _rating_to_prob(int(def_j), mid=520, scale=180)
                    winner = off_team if (rng.random() < (off_w / max(0.01, off_w + def_w))) else def_team_now
                    log(
                        {
                            "clock": clock_s(),
                            "event": "held_ball",
                            "team": off_team,
                            "player_id": handler.id,
                            "player": stats[off_team][handler.id]["name"],
                            "by_id": int(defender_live.id),
                            "by": (stats.get(def_team_now, {}).get(defender_live.id) or {}).get("name") or defender_live.name,
                            "jump_ball_awards": winner,
                            "force_emit": True,
                        }
                    )
                last_pass = None
                paint_ms.clear()
                def_paint_ms.clear()
                poss = str(winner or def_team_now)
                poss = "home" if poss != "away" else "away"
                poss_counts[poss] = int(poss_counts.get(poss, 0) + 1)
                shot_clock_ms = int(rules.game.shot_clock_seconds * 1000)
                backcourt_elapsed_ms = 0
                start_inbound(poss, duration_s=0.9, reason="held_ball", loc="frontcourt")
                if emit_acc >= emit_every:
                    emit_acc = 0.0
                    emit_tick()
                continue

            # Passing decision: create ball movement and assists (events stay the source of truth).
            passing_risk = int(team_ctx.get(poss, {}).get("passing_risk") or 1)
            risk01 = _clamp(float(passing_risk) / 2.0, 0.0, 1.0)
            pass_rate = 0.30
            handler_role = role_by_pid.get(int(handler.id), "balanced")
            freedom = int(team_ctx.get(poss, {}).get("freedom") or 1)
            transition = int(team_ctx.get(poss, {}).get("transition") or 1)
            if focus in ("balance", "perimeter", "pnr"):
                pass_rate += 0.12
            if focus in ("iso", "post"):
                pass_rate -= 0.06
            if want_drive:
                pass_rate -= 0.04
            # Freedom + role: creators swing the ball more; shooters/pivots hold it more.
            if freedom <= 0:
                pass_rate += 0.06
            elif freedom >= 2:
                pass_rate -= 0.04
            if handler_role == "creator":
                pass_rate += 0.06
            elif handler_role in ("shooter", "post"):
                pass_rate -= 0.04
            # Stall/push via pace/transition.
            if float(team_ctx.get(poss, {}).get("pace") or 1.0) < 0.92:
                pass_rate += 0.04
            if transition >= 2 and (not in_backcourt) and int(shot_clock_ms) >= int(sc_total_ms * 0.75):
                pass_rate -= 0.04
            pm = current_play_mod(poss)
            pass_rate += float(pm.get("pass_add") or 0.0)
            pass_rate = _clamp(pass_rate, 0.10, 0.55)

            if rng.random() < pass_rate * dt_internal:
                best_util = -1.0
                best_target: Optional[PlayerState] = None
                # If a play is active and includes a pass sequence, bias the next receiver slightly.
                pm_seq = current_play_mod(poss)
                want_to_slot: Optional[int] = None
                try:
                    seq = pm_seq.get("pass_seq")
                    step = int(pm_seq.get("pass_step") or 0)
                    if isinstance(seq, list) and 0 <= step < len(seq):
                        cur = seq[step]
                        if isinstance(cur, (list, tuple)) and len(cur) == 2:
                            if int(handler.slot) == int(cur[0]):
                                want_to_slot = int(cur[1])
                except Exception:
                    want_to_slot = None
                for cand in off_roster:
                    if cand.id == handler.id:
                        continue
                    tdef = primary_defender(cand, def_team)
                    open01 = 1.0 - _contest01(cand, tdef)
                    cand_p = by_id_player[cand.id]
                    cand_role = role_by_pid.get(int(cand.id), "balanced")

                    if court.is_three(cand.pos, attack_right[poss]):
                        shot_fit = _rating_to_prob(_attr(cand_p, "three_static", 500), mid=520, scale=160)
                        if focus == "perimeter":
                            shot_fit += 0.08
                        if cand_role == "shooter":
                            shot_fit += 0.06
                    elif court.in_paint(cand.pos, attack_right[poss]):
                        shot_fit = _rating_to_prob(_attr(cand_p, "finishing_close", 500), mid=520, scale=170)
                        if focus == "post":
                            shot_fit += 0.08
                        if cand_role in ("slasher", "post"):
                            shot_fit += 0.05
                    else:
                        shot_fit = _rating_to_prob(_attr(cand_p, "mid_range", 500), mid=520, scale=170)

                    dist01 = _clamp(1.0 - (dist(handler.pos, cand.pos) / 12.0), 0.0, 1.0)
                    util = 0.45 * open01 + 0.35 * shot_fit + 0.20 * dist01
                    util += 0.08 * _clamp(float(form_by_pid.get(cand.id, 0.0)), -1.0, 1.0)
                    if cand_role == "creator":
                        util += 0.02  # keep the ball moving through good decision-makers
                    if want_to_slot is not None:
                        util += 0.14 if int(cand.slot) == int(want_to_slot) else -0.02
                    if util > best_util:
                        best_util = util
                        best_target = cand

                util_gate = 0.54 - (0.02 if pm.get("ctx") else 0.0)
                if best_target is not None and best_util >= util_gate:
                    receiver = best_target
                    passer_id = int(handler.id)
                    receiver_id = int(receiver.id)

                    pass_skill = (
                        _attr(shooter_p, "passing", 500)
                        + _attr(shooter_p, "vision", 500)
                        + _attr(shooter_p, "pass_accuracy", 500)
                    ) / 3.0
                    pass_skill01 = _rating_to_prob(int(pass_skill), mid=520, scale=150)
                    lane_min = min(_dist_point_segment(ds.pos, handler.pos, receiver.pos) for ds in def_roster) if def_roster else 9.9
                    lane01 = _clamp(1.0 - (lane_min / 1.9), 0.0, 1.0)
                    lane_steal = max(_attr(by_id_player[ds.id], "steal_lane", 500) for ds in def_roster) if def_roster else 500
                    lane_steal01 = _rating_to_prob(int(lane_steal), mid=520, scale=170)
                    dist01 = _clamp(dist(handler.pos, receiver.pos) / 12.0, 0.0, 1.0)

                    intercept_p = 0.015 + 0.060 * risk01 + 0.040 * lane01 * lane_steal01 + 0.020 * (1.0 - pass_skill01) + 0.015 * dist01
                    try:
                        low_def = str((team_ctx.get(def_team, {}) or {}).get("defense_type") or "").lower()
                        press01 = 1.0 if ("press" in low_def or "full" in low_def or "1-2-2" in low_def) else 0.0
                    except Exception:
                        press01 = 0.0
                    intercept_p += 0.020 * press01 + 0.025 * press01 * lane01
                    if in_backcourt and press01 > 0.0:
                        intercept_p += 0.010
                    intercept_p *= float(current_play_mod(poss).get("tov_mult") or 1.0)
                    intercept_p = _clamp(intercept_p, 0.0, 0.22)
                    intercept = rng.random() < intercept_p
                    interceptor = min(def_roster, key=lambda ds: _dist_point_segment(ds.pos, handler.pos, receiver.pos)) if (intercept and def_roster) else None

                    pass_speed = 12.0 + 6.0 * pass_skill01
                    flight_s = _clamp(dist(handler.pos, receiver.pos) / max(8.0, pass_speed), 0.12, 0.42)
                    pass_state = {
                        "team": poss,
                        "from_id": passer_id,
                        "to_id": receiver_id,
                        "tleft": float(flight_s),
                        "ttotal": float(flight_s),
                        "from": (handler.pos[0], handler.pos[1]),
                        "to": (receiver.pos[0], receiver.pos[1]),
                        "intercept_by_id": int(interceptor.id) if interceptor is not None else None,
                        "intercept_by_team": def_team if interceptor is not None else None,
                    }
                    ball.state = "pass"
                    ball.holder = None
                    if emit_acc >= emit_every:
                        emit_acc = 0.0
                        emit_tick()
                    continue

            # Non-shooting fouls (reach-in / hand-check) based on pressure + team aggression.
            if not in_backcourt:
                defender_tmp = primary_defender(handler, def_team)
                defender_tmp_p = by_id_player[defender_tmp.id]
                pressure_tmp = _clamp(1.0 - (dist(handler.pos, defender_tmp.pos) / 2.0), 0.0, 1.0)
                team_aggr01 = _clamp(float(team_ctx.get(def_team, {}).get("aggression") or 50) / 100.0, 0.0, 1.0)
                foul_disc = _attr(defender_tmp_p, "foul_discipline", 500)
                foul_rate = 0.003 + 0.010 * pressure_tmp * team_aggr01
                foul_rate *= (1.15 - 0.75 * _rating_to_prob(int(foul_disc), mid=520, scale=170))
                if rng.random() < _clamp(foul_rate * dt_internal, 0.0, 0.08):
                    # Book personal + team foul
                    stats[def_team][defender_tmp.id]["pf"] += 1
                    pi = period_idx()
                    team_fouls[def_team][pi] = int(team_fouls[def_team][pi] or 0) + 1
                    if int(rules.bonus.last2min_seconds or 0) > 0 and period_remaining_ms() <= int(rules.bonus.last2min_seconds) * 1000:
                        team_fouls_l2m[def_team][pi] = int(team_fouls_l2m[def_team][pi] or 0) + 1
                    if int(stats[def_team][defender_tmp.id]["pf"] or 0) >= int(rules.game.foul_out or 5):
                        force_sub(def_team, int(defender_tmp.id), reason="foul_out")

                    bonus_kind = foul_bonus_kind(def_team, period_fouls_after=int(team_fouls[def_team][pi] or 0))
                    if bonus_kind != "none":
                        foul_off_team = poss
                        shooter_row = stats[foul_off_team][handler.id]
                        shooter_p = by_id_player.get(handler.id) or {}
                        pressure = 1.0 if (clock_ms <= 120_000 and abs(score["home"] - score["away"]) <= 5) else 0.3 if clock_ms <= 240_000 else 0.0
                        ftm, fta = take_bonus_free_throws(shooter_p, pressure, kind=bonus_kind)
                        shooter_row["fta"] += int(fta)
                        shooter_row["ftm"] += int(ftm)
                        shooter_row["pts"] += int(ftm)
                        add_points(foul_off_team, int(ftm))
                        update_efficiency(shooter_row)
                        # Missed FT => rebound; we treat it as a dead-ball restart for MMP stability.
                        poss_after = def_team
                        in_backcourt_after = True
                        if int(ftm) >= int(fta):
                            shot_clock_ms = int(rules.game.shot_clock_seconds * 1000)
                        if int(ftm) < int(fta):
                            reb_team, reb_pid, reb_meta = resolve_rebound(foul_off_team)
                            stats[reb_team][reb_pid]["reb"] += 1
                            if reb_team == foul_off_team:
                                stats[reb_team][reb_pid]["orb"] += 1
                            else:
                                stats[reb_team][reb_pid]["drb"] += 1
                            log(
                                {
                                    "clock": clock_s(),
                                    "event": "off_reb" if reb_team == foul_off_team else "def_reb",
                                    "team": reb_team,
                                    "player_id": reb_pid,
                                    "player": stats[reb_team][reb_pid]["name"],
                                    "ft_reb": True,
                                    "boxouts": reb_meta.get("boxouts") if isinstance(reb_meta, dict) else None,
                                }
                            )
                            poss_after = reb_team
                            in_backcourt_after = (reb_team != foul_off_team)
                            if reb_team != foul_off_team:
                                shot_clock_ms = int(rules.game.shot_clock_seconds * 1000)
                            else:
                                shot_clock_ms = int(rules.game.shot_clock_reset_off_reb_seconds * 1000)
                        log(
                            {
                                "clock": clock_s(),
                                "event": "foul",
                                "team": foul_off_team,
                                "player_id": handler.id,
                                "player": shooter_row["name"],
                                "by_id": int(defender_tmp.id),
                                "by": stats[def_team][defender_tmp.id]["name"],
                                "ftm": int(ftm),
                                "fta": int(fta),
                                "bonus": True,
                                "bonus_kind": str(bonus_kind),
                            }
                        )
                        if poss_after != foul_off_team:
                            poss_counts[poss_after] = int(poss_counts.get(poss_after, 0) + 1)
                        poss = poss_after
                        last_pass = None
                        in_backcourt = bool(in_backcourt_after)
                        backcourt_elapsed_ms = 0
                        deadball_s = max(deadball_s, 1.6)
                        ball.state = "dead"
                        handler = pick_ballhandler(poss)
                        ball.holder = handler.id
                        ball.pos = handler.pos
                    else:
                        # Side-out: reset to configured deadball reset if below, keep possession.
                        reset_to = int(getattr(rules.game, "shot_clock_reset_deadball_seconds", 0) or 0)
                        if reset_to <= 0:
                            reset_to = 20 if int(rules.game.shot_clock_seconds or 24) >= 30 else 14
                        shot_clock_ms = max(int(shot_clock_ms), int(reset_to * 1000))
                        log(
                            {
                                "clock": clock_s(),
                                "event": "foul",
                                "team": poss,
                                "player_id": handler.id,
                                "player": stats[poss][handler.id]["name"],
                                "by_id": int(defender_tmp.id),
                                "by": stats[def_team][defender_tmp.id]["name"],
                                "ftm": 0,
                                "fta": 0,
                                "bonus": False,
                                "bonus_kind": "none",
                            }
                        )
                        start_inbound(poss, duration_s=0.8, reason="sideout", loc="frontcourt")

                    if emit_acc >= emit_every:
                        emit_acc = 0.0
                        emit_tick()
                    continue

            # Turnover check (on-ball pressure)
            defender = primary_defender(handler, def_team)
            defender_p = by_id_player[defender.id]
            pressure = _clamp(1.0 - (dist(handler.pos, defender.pos) / 2.0), 0.0, 1.0)
            sec_iq = (_attr(shooter_p, "ball_security_iq", 500) + _attr(shooter_p, "ball_control", 500) + _attr(shooter_p, "ball_protect", 500)) / 3
            steal = (_attr(defender_p, "steal_onball", 500) + _attr(defender_p, "def_perimeter", 500)) / 2
            tov_rate = 0.010 + 0.030 * pressure * (1.0 - _rating_to_prob(int(sec_iq), mid=520, scale=170)) + 0.020 * pressure * _rating_to_prob(int(steal), mid=520, scale=170)
            try:
                low_def = str((team_ctx.get(def_team, {}) or {}).get("defense_type") or "").lower()
                press01 = 1.0 if ("press" in low_def or "full" in low_def or "1-2-2" in low_def) else 0.0
            except Exception:
                press01 = 0.0
            tov_rate += 0.010 * press01 * pressure
            if in_backcourt and press01 > 0.0:
                tov_rate += 0.006
            tov_rate *= float(current_play_mod(poss).get("tov_mult") or 1.0)
            if rng.random() < _clamp(tov_rate * dt_internal, 0.0, 0.12):
                stats[poss][handler.id]["tov"] += 1
                stats[def_team][defender.id]["stl"] += 1
                log(
                    {
                        "clock": clock_s(),
                        "event": "turnover",
                        "kind": "steal",
                        "team": poss,
                        "player_id": handler.id,
                        "player": stats[poss][handler.id]["name"],
                        "by_id": defender.id,
                        "by": stats[def_team][defender.id]["name"],
                        "why": {
                            "pressure": float(pressure),
                            "press01": float(press01),
                            "security01": float(_rating_to_prob(int(sec_iq), mid=520, scale=170)),
                            "steal01": float(_rating_to_prob(int(steal), mid=520, scale=170)),
                            "play_ctx": current_play_mod(poss).get("ctx"),
                            "momentum": float(momentum.get(def_team, 0.0)),
                        },
                        "force_emit": True,
                    }
                )
                poss = def_team
                last_pass = None
                in_backcourt = True
                backcourt_elapsed_ms = 0
                shot_clock_ms = int(rules.game.shot_clock_seconds * 1000)
                poss_counts[poss] = int(poss_counts.get(poss, 0) + 1)
                paint_ms.clear()
                # Live-ball steal for realism.
                ball.state = "live"
                ball.holder = defender.id
                ball.pos = defender.pos
                if emit_acc >= emit_every:
                    emit_acc = 0.0
                    emit_tick()
                continue

            defender = primary_defender(handler, def_team)
            defender_p = by_id_player[defender.id]

            contest = _contest01(handler, defender)
            open01 = 1.0 - contest
            selection = _attr(shooter_p, "shot_selection", 500)
            handler_role = role_by_pid.get(int(handler.id), "balanced")
            profile_raw = str(team_ctx.get(poss, {}).get("shot_profile") or "").strip().lower()
            if not profile_raw:
                profile_raw = "three" if focus in ("perimeter", "3pt", "spacing") else "rim" if focus in ("post", "iso", "attack") else "mixed"
            is_three_loc = bool(court.is_three(handler.pos, attack_right[poss]))
            in_paint_loc = bool(court.in_paint(handler.pos, attack_right[poss]))
            three01_p = _rating_to_prob(int(_attr(shooter_p, "three_static", 500)), mid=520, scale=170)
            fin01_p = _rating_to_prob(int(_attr(shooter_p, "finishing_close", 500)), mid=520, scale=170)
            mid01_p = _rating_to_prob(int(_attr(shooter_p, "mid_range", 500)), mid=520, scale=170)
            want = 0.10 + 0.30 * _rating_to_prob(selection, mid=520, scale=170)
            want += 0.25 * (1.0 - _clamp(float(shot_clock_ms) / float(int(rules.game.shot_clock_seconds * 1000)), 0.0, 1.0))
            want += 0.20 * open01
            pace = float(team_ctx.get(poss, {}).get("pace") or 1.0)
            want += 0.06 * (pace - 1.0)
            # Hot/cold form influences shot appetite.
            want += 0.08 * _clamp(float(form_by_pid.get(handler.id, 0.0)), -1.0, 1.0)
            want += 0.04 * _clamp(float(momentum.get(poss, 0.0)), -1.0, 1.0)
            # Role and skill alignment.
            if handler_role == "creator":
                want -= 0.02
            elif handler_role == "shooter" and is_three_loc:
                want += 0.06
            elif handler_role == "slasher" and in_paint_loc:
                want += 0.05
            elif handler_role == "post" and in_paint_loc:
                want += 0.05
            if is_three_loc:
                want += 0.06 * (three01_p - 0.5)
            elif in_paint_loc:
                want += 0.06 * (fin01_p - 0.5)
            else:
                want += 0.04 * (mid01_p - 0.5)
            # Team shot profile targets.
            if "three" in profile_raw:
                want += 0.06 if is_three_loc else (-0.03 if in_paint_loc else 0.0)
            if "rim" in profile_raw:
                want += 0.06 if in_paint_loc else (-0.03 if is_three_loc else 0.0)
            # Push/stall: transition setting affects early-clock shooting.
            transition = int(team_ctx.get(poss, {}).get("transition") or 1)
            if transition >= 2 and int(shot_clock_ms) >= int(sc_total_ms * 0.75):
                want += 0.04
            if transition <= 0 and int(shot_clock_ms) >= int(sc_total_ms * 0.75):
                want -= 0.03
            want += float(current_play_mod(poss).get("shot_add") or 0.0)
            if focus in ("perimeter", "3pt", "spacing") and court.is_three(handler.pos, attack_right[poss]):
                want += 0.12
            if focus in ("post", "iso", "attack") and court.in_paint(handler.pos, attack_right[poss]):
                want += 0.12
            want = _clamp(want, 0.05, 0.85)

            if (not in_backcourt) and rng.random() < want:
                pressure = 1.0 if (clock_ms <= 120_000 and abs(score["home"] - score["away"]) <= 5) else 0.5 if clock_ms <= 240_000 else 0.0
                form = float(form_by_pid.get(handler.id, 0.0))
                made, flight_s, is_three, p_make = _shot_make_prob(
                    rng,
                    court,
                    rules,
                    shooter_p,
                    handler,
                    defender_p,
                    defender,
                    attack_right[poss],
                    pressure,
                    form,
                )
                # Shooting foul chance (simplified): more on drives/in-paint + high pressure + low discipline.
                foul_disc = _attr(defender_p, "foul_discipline", 500)
                agg = _attr(shooter_p, "aggressiveness", 500)
                in_paint = court.in_paint(handler.pos, attack_right[poss])
                foul_p = 0.03
                foul_p += (0.10 if in_paint else 0.04) * _clamp(contest + pressure * 0.6, 0.0, 1.0)
                foul_p += 0.05 * _rating_to_prob(int(agg), mid=520, scale=170)
                foul_p *= (1.15 - 0.75 * _rating_to_prob(int(foul_disc), mid=520, scale=170))
                foul = rng.random() < _clamp(foul_p, 0.0, 0.35)
                assist_from_id: Optional[int] = None
                if last_pass and str(last_pass.get("team") or "") == str(poss):
                    if int(last_pass.get("to_id") or 0) == int(handler.id) and int(last_pass.get("from_id") or 0) != int(handler.id):
                        elapsed_ms = int(last_pass.get("clock_ms") or 0) - int(clock_ms)
                        if 0 <= elapsed_ms <= 3000:
                            assist_from_id = int(last_pass.get("from_id") or 0) or None
                # Blocks & goaltending (approx): more likely on contested close shots.
                blocked_by_id: Optional[int] = None
                goaltend_by_id: Optional[int] = None
                blk_rating = (_attr(defender_p, "block", 500) + _attr(defender_p, "rim_protect", 500)) / 2.0
                blk01 = _rating_to_prob(int(blk_rating), mid=520, scale=170)
                dist01 = _clamp(1.0 - (dist(handler.pos, defender.pos) / 1.25), 0.0, 1.0)
                block_p = 0.010 + 0.220 * blk01 * dist01 * _clamp(contest + 0.2, 0.0, 1.0)
                if in_paint:
                    block_p += 0.060 * blk01 * dist01
                if rng.random() < _clamp(block_p, 0.0, 0.45):
                    if goaltending_enabled and in_paint:
                        gt_p = 0.030 + 0.140 * blk01 * _clamp(contest + pressure * 0.4, 0.0, 1.0)
                        if rng.random() < _clamp(gt_p, 0.0, 0.25):
                            goaltend_by_id = int(defender.id)
                            made = True
                            p_make = 1.0
                        else:
                            blocked_by_id = int(defender.id)
                            made = False
                            flight_s = float(_clamp(min(float(flight_s), 0.24), 0.12, 0.40))
                    else:
                        blocked_by_id = int(defender.id)
                        made = False
                        flight_s = float(_clamp(min(float(flight_s), 0.24), 0.12, 0.40))
                why = {
                    "role": role_by_pid.get(int(handler.id), "balanced"),
                    "focus": str(focus),
                    "profile": str(profile_raw),
                    "contest": float(contest),
                    "pressure": float(pressure),
                    "form": float(form),
                    "fatigue01": float(_clamp((100.0 - float(handler.energy)) / 100.0, 0.0, 1.0)),
                    "play_ctx": current_play_mod(poss).get("ctx"),
                    "momentum": float(momentum.get(poss, 0.0)),
                }
                shot = {
                    "team": poss,
                    "shooter_id": handler.id,
                    "tleft": flight_s,
                    "ttotal": flight_s,
                    "made": made,
                    "is_three": is_three,
                    "assist_from_id": assist_from_id,
                    "from": (handler.pos[0], handler.pos[1]),
                    "to": (rim[0], rim[1]),
                    # normalised shot location for charts
                    "x": (handler.pos[0] / court.L) * 100.0,
                    "y": (handler.pos[1] / court.W) * 100.0,
                    "contest": float(contest),
                    "p_make": float(p_make),
                    "foul": bool(foul),
                    "foul_by_id": int(defender.id),
                    "blocked_by_id": int(blocked_by_id) if blocked_by_id else None,
                    "goaltend_by_id": int(goaltend_by_id) if goaltend_by_id else None,
                    "why": why,
                }
                ball.state = "shot"
                ball.holder = None

        if emit_acc >= emit_every:
            emit_acc = 0.0
            emit_tick()

    # Finalize minutes + efficiency strings
    for t in ("home", "away"):
        for pid, row in stats[t].items():
            row["min"] = round(float(min_ms[t].get(int(pid), 0)) / 60000.0, 1)
            update_efficiency(row)

    def _team_totals(team: str) -> Dict[str, Any]:
        rows = list(stats.get(team, {}).values())
        fgm = sum(int(r.get("fgm") or 0) for r in rows)
        fga = sum(int(r.get("fga") or 0) for r in rows)
        tpm = sum(int(r.get("3pm") or 0) for r in rows)
        tpa = sum(int(r.get("3pa") or 0) for r in rows)
        ftm = sum(int(r.get("ftm") or 0) for r in rows)
        fta = sum(int(r.get("fta") or 0) for r in rows)
        tov = sum(int(r.get("tov") or 0) for r in rows)
        orb = sum(int(r.get("orb") or 0) for r in rows)
        drb = sum(int(r.get("drb") or 0) for r in rows)
        reb = sum(int(r.get("reb") or 0) for r in rows)
        ast = sum(int(r.get("ast") or 0) for r in rows)
        stl = sum(int(r.get("stl") or 0) for r in rows)
        blk = sum(int(r.get("blk") or 0) for r in rows)
        pf = sum(int(r.get("pf") or 0) for r in rows)
        pts = int(score.get(team) or 0)
        poss_est = float(fga) - float(orb) + float(tov) + 0.44 * float(fta)
        poss_est = max(1.0, poss_est)
        efg = ((float(fgm) + 0.5 * float(tpm)) / float(fga)) if fga > 0 else 0.0
        ts_den = 2.0 * (float(fga) + 0.44 * float(fta))
        ts = (float(pts) / ts_den) if ts_den > 1e-9 else 0.0
        return {
            "pts": int(pts),
            "fgm": int(fgm),
            "fga": int(fga),
            "3pm": int(tpm),
            "3pa": int(tpa),
            "ftm": int(ftm),
            "fta": int(fta),
            "tov": int(tov),
            "orb": int(orb),
            "drb": int(drb),
            "reb": int(reb),
            "ast": int(ast),
            "stl": int(stl),
            "blk": int(blk),
            "pf": int(pf),
            "poss_est": round(poss_est, 1),
            "efg": round(efg * 100.0, 1),
            "ts": round(ts * 100.0, 1),
            "ftr": round((float(fta) / float(fga)) if fga else 0.0, 3),
            "tov_pct": round(float(tov) / float(poss_est), 3),
        }

    home_tot = _team_totals("home")
    away_tot = _team_totals("away")
    poss_avg = 0.5 * (float(home_tot.get("poss_est") or 0.0) + float(away_tot.get("poss_est") or 0.0))
    total_minutes = float(total_ms) / 60000.0 if total_ms > 0 else 0.0
    pace40 = (poss_avg * (40.0 / total_minutes)) if total_minutes > 1e-6 else 0.0
    # ORB% / ratings
    home_orb_pct = float(home_tot["orb"]) / float(max(1, int(home_tot["orb"]) + int(away_tot["drb"])))
    away_orb_pct = float(away_tot["orb"]) / float(max(1, int(away_tot["orb"]) + int(home_tot["drb"])))
    home_tot["orb_pct"] = round(home_orb_pct, 3)
    away_tot["orb_pct"] = round(away_orb_pct, 3)
    home_tot["ortg"] = round((float(home_tot["pts"]) / float(home_tot["poss_est"])) * 100.0, 1)
    away_tot["ortg"] = round((float(away_tot["pts"]) / float(away_tot["poss_est"])) * 100.0, 1)
    home_tot["drtg"] = round((float(away_tot["pts"]) / float(home_tot["poss_est"])) * 100.0, 1)
    away_tot["drtg"] = round((float(home_tot["pts"]) / float(away_tot["poss_est"])) * 100.0, 1)

    def _lineup_rows(team: str) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for key, row in (lineup_adv.get(team) or {}).items():
            ms = int(row.get("ms") or 0)
            mins = round(float(ms) / 60000.0, 1)
            pts_for = int(row.get("pts_for") or 0)
            pts_against = int(row.get("pts_against") or 0)
            out.append({"ids": list(key), "min": mins, "pm": int(pts_for - pts_against), "pts_for": pts_for, "pts_against": pts_against})
        out.sort(key=lambda r: float(r.get("min") or 0.0), reverse=True)
        return out

    team_totals = {
        "home": home_tot,
        "away": away_tot,
        "pace40": round(float(pace40), 1),
    }

    # Final
    return {
        "ruleset": ruleset,
        "engine": {"mode": "mmp_micro", "dt_internal_ms": int(dt_internal_ms), "tick_ms": int(tick_ms)},
        "score": {"home": int(score["home"]), "away": int(score["away"])},
        "team_totals": team_totals,
        "score_by_period": score_by_period,
        "score_by_quarter": score_by_period,
        "period_count": int(game_periods),
        "period_seconds": int(game_period_seconds),
        "ot_seconds": int(ot_ms / 1000) if ot_ms > 0 else 0,
        "ot_count": int(ot_count),
        "total_seconds": int(total_ms / 1000),
        "team_stats": {"home": {"pts": int(score["home"])}, "away": {"pts": int(score["away"])}},
        "player_stats": {"home": list(stats["home"].values()), "away": list(stats["away"].values())},
        "lineups": {
            "home": [{"id": int(ps.id), "name": str(ps.name or "")} for ps in home_on],
            "away": [{"id": int(ps.id), "name": str(ps.name or "")} for ps in away_on],
            "bench_home": [{"id": int(ps.id), "name": str(ps.name or "")} for ps in home_bench],
            "bench_away": [{"id": int(ps.id), "name": str(ps.name or "")} for ps in away_bench],
            "advanced": {"home": _lineup_rows("home"), "away": _lineup_rows("away")},
        },
        "play_by_play": None,
        "possessions": int(poss_counts.get("home", 0) + poss_counts.get("away", 0)),
        "team_possessions": {"home": int(poss_counts.get("home", 0)), "away": int(poss_counts.get("away", 0))},
        "shot_chart": shot_chart,
        "player_possession_time_ms": poss_time_ms,
    }
