from __future__ import annotations

import random
import time
from typing import Any, Dict, List

from ..domain.catalogs import load_catalogs
from .name_service import pick_birthplace, pick_nationality

POSITIONS = ["PG", "SG", "SF", "PF", "C"]
HANDS = ["L", "R"]
HEIGHT_BY_POS_CM = {
    "PG": (175, 193),
    "SG": (182, 198),
    "SF": (192, 208),
    "PF": (198, 213),
    "C": (203, 220),
}
HEIGHT_BY_POS_CM_F = {
    "PG": (165, 178),
    "SG": (170, 183),
    "SF": (178, 190),
    "PF": (185, 196),
    "C": (190, 205),
}
UNICORN_EXTRA_CM = 13


def _rand_attr(mean: float, std: float, min_v: int = 1, max_v: int = 1000) -> int:
    value = int(random.gauss(mean, std))
    return max(min_v, min(max_v, value))


def _sample_unique(pool: List[str], count: int) -> List[str]:
    if count <= 0:
        return []
    if count >= len(pool):
        return list(pool)
    return random.sample(pool, count)


GUARD_ARCHETYPES = {
    "FLOOR_GEN",
    "PNR_MAESTRO",
    "ISO_SCORER",
    "SLASHING_PM",
    "HELIOCENTRIC",
    "COMBO_GUARD",
    "3PT_SPECIALIST",
    "SHOT_CREATOR",
    "DEF_PEST",
    "PERIMETER_LOCK",
    "MICROWAVE",
    "OFF_BALL_GS",
    "TWO_WAY_GUARD",
    "BULLY_GUARD",
    "SLASHER",
    "ACROBAT",
    "STREETBALLER",
    "EURO_SNIPER",
    "VOLUME_SCORER",
}

WING_ARCHETYPES = {
    "WING_STOPPER",
    "3_AND_D",
    "POINT_FORWARD",
    "SCORING_WING",
    "TRANSITION_GOD",
    "CORNER_SPEC",
    "GLUE_GUY",
    "CONNECTING_FWD",
    "ATHLETIC_FREAK",
    "DEFENSIVE_CHESS",
    "COPYCAT",
    "SYSTEM_SOLDIER",
}

BIG_ARCHETYPES = {
    "STRETCH_FOUR",
    "FACEUP_FOUR",
    "POST_MASTER",
    "BRUISER",
    "LOB_THREAT",
    "GLASS_CLEANER",
    "RIM_PROTECTOR",
    "SWITCH_BIG",
    "STRETCH_FIVE",
    "PLAYMAKING_HUB",
    "ANCHOR",
    "SCREEN_SETTER",
    "ENERGY_BIG",
    "SMALL_BALL_5",
    "ENFORCER",
    "RAW_PROSPECT",
    "VETERAN_MENTOR",
    "UNICORN",
}

UNIVERSAL_ARCHETYPES = {"JOURNEYMAN", "COPYCAT", "SYSTEM_SOLDIER", "GLUE_GUY"}

MENTALITY_ALLOWED_BY_POS = {
    "PG": {
        "mamba",
        "general",
        "analitico",
        "hielo frio",
        "ganador",
        "mentor",
        "jugador de sistema",
        "perfeccionista",
        "underdog",
        "leal",
        "enigma",
    },
    "SG": {
        "mamba",
        "rockstar",
        "ganador",
        "volatil",
        "diva",
        "cazador de stats",
        "perfeccionista",
        "underdog",
        "hielo frio",
        "analitico",
    },
    "SF": {
        "ganador",
        "obrero",
        "underdog",
        "analitico",
        "hielo frio",
        "enigma",
        "volatil",
        "perfeccionista",
    },
    "PF": {
        "obrero",
        "maton",
        "voluntad de hierro",
        "ganador",
        "leal",
        "underdog",
        "alegre",
        "perfeccionista",
    },
    "C": {
        "obrero",
        "maton",
        "voluntad de hierro",
        "ganador",
        "leal",
        "alegre",
        "jugador de sistema",
        "mentor",
    },
}

POS_DENY_KEYWORDS = {
    "PG": ["pivot", "poste", "rebote", "tapon", "interior", "aro", "pintura", "protector"],
    "SG": ["pivot", "poste", "rebote", "tapon", "interior", "aro", "pintura", "protector"],
    "SF": ["base puro", "armador", "point guard"],
    "PF": ["base", "guardia", "perimetro puro", "crossover", "dribble", "manejo elite"],
    "C": ["base", "guardia", "perimetro puro", "crossover", "dribble", "manejo elite"],
}

POS_GROUP_BIAS = {
    "PG": ["cerebro", "manejo", "ofensiva"],
    "SG": ["ofensiva", "manejo", "cerebro"],
    "SF": ["ofensiva", "defensa", "fisico"],
    "PF": ["defensa", "fisico", "ofensiva"],
    "C": ["defensa", "fisico", "psico"],
}


def _filter_archetypes(pos: str, archetypes: List[str]) -> List[str]:
    guard = GUARD_ARCHETYPES & set(archetypes)
    wing = WING_ARCHETYPES & set(archetypes)
    big = BIG_ARCHETYPES & set(archetypes)
    universal = UNIVERSAL_ARCHETYPES & set(archetypes)
    if pos == "PG":
        allowed = guard | universal
    elif pos == "SG":
        allowed = guard | wing | universal
    elif pos == "SF":
        allowed = wing | guard | universal
    elif pos == "PF":
        allowed = big | wing | universal
    elif pos == "C":
        allowed = big | universal
    else:
        allowed = set(archetypes)
    filtered = [a for a in archetypes if a in allowed]
    return filtered or list(archetypes)


def _filter_mentalities(pos: str, mentalities: List[str], labels: Dict[str, str]) -> List[str]:
    allowed = MENTALITY_ALLOWED_BY_POS.get(pos)
    if not allowed:
        return mentalities
    allowed_lower = {a.lower() for a in allowed}
    filtered = [m for m in mentalities if labels.get(str(m), "").lower() in allowed_lower]
    return filtered if len(filtered) >= 3 else mentalities


def _filter_by_keywords(pos: str, items: List[str], labels: Dict[str, str], descs: Dict[str, str]) -> List[str]:
    deny = POS_DENY_KEYWORDS.get(pos, [])
    if not deny:
        return items
    filtered = []
    for item in items:
        text = f"{labels.get(item, '')} {descs.get(item, '')} {item}".lower()
        if any(k in text for k in deny):
            continue
        filtered.append(item)
    return filtered if len(filtered) >= max(2, len(items) // 4) else items


def _group_from_category(value: str) -> str:
    if not value:
        return ""
    low = value.lower()
    if "ofensiva" in low:
        return "ofensiva"
    if "cerebro" in low:
        return "cerebro"
    if "defensa" in low:
        return "defensa"
    if "fisico" in low:
        return "fisico"
    if "manejo" in low:
        return "manejo"
    if "psico" in low:
        return "psico"
    return ""


def _apply_quality(attr_map: Dict[str, int], quality: float | None) -> Dict[str, int]:
    if quality is None:
        return attr_map
    try:
        scale = float(quality)
    except (TypeError, ValueError):
        return attr_map
    scale = max(0.7, min(1.15, scale))
    return {key: max(1, min(1000, int(value * scale))) for key, value in attr_map.items()}


def _generate_player_attributes(
    attributes: List[str],
    categories: Dict[str, str],
    pos: str,
    quality: float | None = None,
) -> Dict[str, int]:
    group_for_attr: Dict[str, str] = {}
    groups: Dict[str, List[str]] = {}
    for attr in attributes:
        group = _group_from_category(categories.get(attr, ""))
        if group:
            group_for_attr[attr] = group
            groups.setdefault(group, []).append(attr)

    available_groups = list(groups.keys()) or ["ofensiva", "cerebro", "defensa", "fisico", "manejo", "psico"]
    profile = random.choices(["specialist", "balanced", "two_way", "volatile"], weights=[35, 35, 15, 15], k=1)[0]
    bias_groups = POS_GROUP_BIAS.get(pos, available_groups)
    primary = random.choice(bias_groups or available_groups)
    secondary_choices = [g for g in available_groups if g != primary]
    secondary = random.choice(secondary_choices) if secondary_choices else primary

    attr_map: Dict[str, int] = {}
    for key in attributes:
        group = group_for_attr.get(key, primary)
        if profile == "balanced":
            mean, std = 600, 80
        elif profile == "two_way":
            mean = 760 if group in {primary, secondary} else 520
            std = 95
        elif profile == "volatile":
            mean, std = 560, 160
        else:
            mean = 820 if group == primary else 650 if group == secondary else 420
            std = 110
        attr_map[key] = _rand_attr(mean, std)

    if profile in {"specialist", "volatile"} and attributes:
        weak_count = 2 if len(attributes) > 10 else 1
        for key in random.sample(attributes, k=weak_count):
            attr_map[key] = max(1, attr_map[key] - random.randint(140, 260))
        spike_count = 2 if len(attributes) > 12 else 1
        for key in random.sample(attributes, k=spike_count):
            attr_map[key] = min(1000, attr_map[key] + random.randint(140, 220))

    return _apply_quality(attr_map, quality)


def generate_player(
    seed: int | None = None,
    pos: str | None = None,
    quality: float | None = None,
    league_id: str | None = None,
) -> Dict[str, Any]:
    if seed is not None:
        random.seed(seed)

    catalogs = load_catalogs()
    attributes = catalogs["attributes"]
    archetypes = catalogs["archetypes"]
    mentalities = catalogs["mentalities"]
    origins = catalogs["origins"]
    personalities = catalogs.get("personalities", [])
    traits = catalogs["traits"]
    perks = catalogs["perks"]

    origin_labels = catalogs.get("origin_labels", {})
    personality_labels = catalogs.get("personality_labels", {})
    trait_labels = catalogs.get("trait_labels", {})
    perk_labels = catalogs.get("perk_labels", {})
    archetype_labels = catalogs.get("archetype_labels", {})
    mentalidad_labels = catalogs.get("mentalidad_labels", {})
    attribute_labels = catalogs.get("attribute_labels", {})
    attribute_desc = catalogs.get("attribute_desc", {})
    attribute_categories = catalogs.get("attribute_categories", {})
    origin_desc = catalogs.get("origin_desc", {})
    trait_desc = catalogs.get("trait_desc", {})
    perk_desc = catalogs.get("perk_desc", {})
    archetype_desc = catalogs.get("archetype_desc", {})
    mentalidad_desc = catalogs.get("mentalidad_desc", {})
    personality_desc = catalogs.get("personality_desc", {})

    pos = pos or random.choice(POSITIONS)
    archetype_pool = _filter_archetypes(pos, archetypes)
    mentality_pool = _filter_mentalities(pos, mentalities, mentalidad_labels)
    trait_pool = _filter_by_keywords(pos, traits, trait_labels, trait_desc)
    perk_pool = _filter_by_keywords(pos, perks, perk_labels, perk_desc)
    archetype = random.choice(archetype_pool)
    mentality = random.choice(mentality_pool)
    origin = random.choice(origins)
    personality = random.choice(personalities) if personalities else "PERS_001"

    nationality = pick_nationality(league_id)
    birthplace = pick_birthplace(nationality)

    attr_map = _generate_player_attributes(attributes, attribute_categories, pos, quality=quality)

    scouting_tier = random.choices([1, 2, 3, 4, 5, 6], weights=[8, 20, 26, 22, 16, 8], k=1)[0]
    league_key = str(league_id or "").upper()
    is_womens = league_key in {"WNBA", "NCAA_W"}
    height_map = HEIGHT_BY_POS_CM_F if is_womens else HEIGHT_BY_POS_CM
    min_height, max_height = height_map.get(pos, (170, 200))
    if archetype == "UNICORN":
        height_cm = random.randint(max_height + 1, max_height + UNICORN_EXTRA_CM)
    else:
        height_cm = random.randint(min_height, max_height)

    player_traits = _sample_unique(trait_pool, random.randint(0, 3))
    player_perks = _sample_unique(perk_pool, random.randint(0, 2))

    if league_key in {"NCAA_M", "NCAA_W"}:
        age = random.randint(18, 23)
    elif league_key == "WNBA":
        age = random.randint(18, 34)
    else:
        age = random.randint(14, 34)

    # Calculate average rating (internal only)
    overall = int(sum(attr_map.values()) / len(attr_map)) if attr_map else 500

    # Calculate potential (younger = higher potential)
    potential_bonus = max(0, (28 - age) * 15)  # Up to +150 for 18yo
    potential = min(1000, overall + potential_bonus + random.randint(-30, 50))

    # Calculate market value based on overall, potential, and age
    base_value = (overall / 1000) * 5_000_000  # 0-5M base
    potential_multiplier = 1 + ((potential - overall) / 1000)  # +0% to +100%
    age_multiplier = 1.5 if age <= 23 else 1.2 if age <= 27 else 0.8 if age <= 32 else 0.5
    market_value = int(base_value * potential_multiplier * age_multiplier)
    if league_key.startswith("NCAA"):
        market_value = int(market_value * 0.15)
    gender = "F" if is_womens else "M"
    if gender == "F":
        weight_kg = random.randint(58, 98)
    else:
        weight_kg = random.randint(70, 122)

    player = {
        "league_id": league_id,
        "bio": {
            "age": age,
            "pos": pos,
            "hand": random.choice(HANDS),
            "gender": gender,
            "height_cm": height_cm,
            "wingspan_cm": height_cm + random.randint(0, 16),
            "weight_kg": weight_kg,
            "nationality": nationality,
            "birthplace": birthplace,
        },
        "identity": {
            "origin": origin,
            "origin_label": origin_labels.get(origin, ""),
            "origin_desc": origin_desc.get(origin, ""),
            "mentalidad": mentality,
            "mentalidad_label": mentalidad_labels.get(str(mentality), ""),
            "mentalidad_desc": mentalidad_desc.get(str(mentality), ""),
            "arquetipo": archetype,
            "arquetipo_label": archetype_labels.get(archetype, ""),
            "arquetipo_desc": archetype_desc.get(archetype, ""),
            "personality": personality,
            "personality_label": personality_labels.get(personality, ""),
            "personality_desc": personality_desc.get(personality, ""),
        },
        "scout": {
            "tier": scouting_tier,
        },
        "attributes": attr_map,
        "attributes_label": attribute_labels,
        "attributes_desc": attribute_desc,
        "traits": player_traits,
        "traits_label": [trait_labels.get(t, t) for t in player_traits],
        "traits_desc": [trait_desc.get(t, "") for t in player_traits],
        "perks": player_perks,
        "perks_label": [perk_labels.get(p, p) for p in player_perks],
        "perks_desc": [perk_desc.get(p, "") for p in player_perks],
        "generated_at": int(time.time()),
        "potential": potential,
        "market_value": market_value,
        "position": pos,
        "health": {"fatigue": 0, "injury_status": "healthy"},
        "morale": 50,
    }

    return player
